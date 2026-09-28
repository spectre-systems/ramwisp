#!/usr/bin/env python3
"""Processo principal da enclave: um job, uma vida.

1. sobe o loopback e um proxy HTTP CONNECT em 127.0.0.1:3128 que sai pela instância hospedeira (vsock);
   o TLS é ponta a ponta daqui de dentro, então a hospedeira só vê host:porta;
2. espera o "hello" da hospedeira com o nonce do cliente e devolve a atestação com a chave pública efêmera;
3. recebe a entrada selada, abre (só aqui dentro), roda o agente como usuário sem privilégio,
   manda estatísticas de RAM em claro (metadado) e devolve o resultado selado para a chave do cliente;
4. sai. A enclave é destruída e a memória com ela.

Transporte: vsock em produção; sockets unix com WISP_DEV=1 (container sem rede emulando a enclave).
"""
import base64, fcntl, json, os, pwd, select, shlex, shutil, signal, socket, struct, subprocess, sys, termios, threading, time

import nsm
from sealed import EnclaveSession, TtyChannel, b64, unb64

DEV = os.environ.get("WISP_DEV") == "1"
CTL_PORT, EGRESS_PORT, PARENT_CID = 5005, 8001, 3
PROXY = ("127.0.0.1", 3128)
AGENT_USER = "agent"


def log(*a):
    print("[enclave]", *a, file=sys.stderr, flush=True)


# ---------------------------------------------------------------- transporte

def listen_ctl():
    if DEV:
        path = os.environ["WISP_DEV_CTL"]
        if os.path.exists(path):
            os.unlink(path)
        s = socket.socket(socket.AF_UNIX); s.bind(path); os.chmod(path, 0o666)
    else:
        s = socket.socket(socket.AF_VSOCK, socket.SOCK_STREAM); s.bind((socket.VMADDR_CID_ANY, CTL_PORT))
    s.listen(1)
    return s


def dial_parent_egress():
    if DEV:
        s = socket.socket(socket.AF_UNIX); s.connect(os.environ["WISP_DEV_EGRESS"])
    else:
        s = socket.socket(socket.AF_VSOCK, socket.SOCK_STREAM); s.connect((PARENT_CID, EGRESS_PORT))
    return s


SEND_LOCK = threading.Lock()                          # durante a execução, várias threads escrevem no ctl


def send_frame(sock, obj):
    data = json.dumps(obj).encode()
    with SEND_LOCK:
        sock.sendall(struct.pack(">I", len(data)) + data)


def recv_exact(sock, n):
    buf = b""
    while len(buf) < n:
        chunk = sock.recv(n - len(buf))
        if not chunk:
            raise ConnectionError("fechado")
        buf += chunk
    return buf


def recv_frame(sock):
    n = struct.unpack(">I", recv_exact(sock, 4))[0]
    return json.loads(recv_exact(sock, n))


# ---------------------------------------------------------------- saída para a internet

def pipe(a, b):
    try:
        while True:
            r, _, _ = select.select([a, b], [], [], 600)
            if not r:
                return
            for s in r:
                data = s.recv(65536)
                if not data:
                    return
                (b if s is a else a).sendall(data)
    except OSError:
        pass
    finally:
        a.close(); b.close()


def handle_proxy_client(c):
    try:
        head = b""
        while b"\r\n\r\n" not in head:
            chunk = c.recv(4096)
            if not chunk:
                return c.close()
            head += chunk
            if len(head) > 65536:
                return c.close()
        line, rest = head.split(b"\r\n", 1)
        method, target, _ = line.decode("latin-1").split(" ", 2)
        if method == "CONNECT":
            hostport, leftover = target, head.split(b"\r\n\r\n", 1)[1]
        else:                                           # http:// em forma absoluta -> origem
            if not target.startswith("http://"):
                c.sendall(b"HTTP/1.1 400 Bad Request\r\n\r\n"); return c.close()
            hp, _, path = target[7:].partition("/")
            hostport = hp if ":" in hp else hp + ":80"
            leftover = f"{method} /{path} HTTP/1.1\r\n".encode() + rest
        up = dial_parent_egress()
        up.sendall(hostport.encode() + b"\n")
        answer = b""
        while not answer.endswith(b"\n"):
            chunk = up.recv(1)
            if not chunk:
                break
            answer += chunk
        if not answer.startswith(b"OK"):
            c.sendall(b"HTTP/1.1 403 Forbidden\r\n\r\n" + answer); up.close(); return c.close()
        if method == "CONNECT":
            c.sendall(b"HTTP/1.1 200 Connection established\r\n\r\n")
        if leftover:
            up.sendall(leftover)
        pipe(c, up)
    except Exception as e:
        log("proxy:", e)
        try:
            c.close()
        except OSError:
            pass


def start_proxy():
    srv = socket.socket(); srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind(PROXY); srv.listen(128)

    def loop():
        while True:
            c, _ = srv.accept()
            threading.Thread(target=handle_proxy_client, args=(c,), daemon=True).start()
    threading.Thread(target=loop, daemon=True).start()


# ---------------------------------------------------------------- agente

def mem():
    info = {}
    with open("/proc/meminfo") as f:
        for line in f:
            k, v = line.split(":", 1)
            info[k] = int(v.split()[0]) // 1024
    return info["MemTotal"], info["MemTotal"] - info["MemAvailable"]


def build_command(job):
    """(env extra, comando). Espelha o ENGINES do wisp original."""
    engine, auth = job["engine"], job["auth"]
    t, model = int(job.get("timeout", 1800)), job.get("model")
    env = {}
    if engine == "claude":
        env["ANTHROPIC_API_KEY" if auth["kind"] == "anthropic_key" else "CLAUDE_CODE_OAUTH_TOKEN"] = auth["value"]
        cmd = (f'timeout {t} claude -p "$MISSAO" --output-format stream-json --verbose --max-turns {int(job.get("turns", 20))} '
               "--permission-mode bypassPermissions" + (f" --model {shlex.quote(model)}" if model else ""))
    elif engine == "codex":
        auth_json = json.dumps({"OPENAI_API_KEY": auth["value"]}) if auth["kind"] == "openai_key" else auth["value"]
        env["CODEX_AUTH"] = auth_json
        cmd = ("umask 077; mkdir -p ~/.codex && printf '%s' \"$CODEX_AUTH\" > ~/.codex/auth.json && unset CODEX_AUTH && "
               f"timeout {t} codex exec --json --skip-git-repo-check --ephemeral "
               "--dangerously-bypass-approvals-and-sandbox" + (f" -m {shlex.quote(model)}" if model else "")
               + ' "$MISSAO" </dev/null')
    else:
        raise ValueError(f"motor desconhecido: {engine}")
    return env, cmd


GIT_ENV = {"GIT_AUTHOR_NAME": "wisp", "GIT_AUTHOR_EMAIL": "wisp@localhost",
           "GIT_COMMITTER_NAME": "wisp", "GIT_COMMITTER_EMAIL": "wisp@localhost"}
MAX_PATCH = 8 * 1024 * 1024
JUNK = ["__pycache__/", "*.pyc", ".pytest_cache/", "node_modules/", ".venv/", "venv/", "dist/", "build/",
        ".next/", "target/", ".cache/", "coverage/", ".mypy_cache/", ".ruff_cache/", ".DS_Store"]
WORKSPACE_NOTE = ("\n\n---\nO projeto do usuário está em ~/work (uma cópia; rode comandos lá). "
                  "Tudo o que você mudar em ~/work volta para ele como patch ao final.")


def as_agent(pw, argv, cwd, **kw):
    def drop():
        os.setgroups([]); os.setgid(pw.pw_gid); os.setuid(pw.pw_uid)
    env = {"PATH": "/usr/local/bin:/usr/bin:/bin", "HOME": pw.pw_dir, **GIT_ENV}
    return subprocess.run(argv, cwd=cwd, env=env, preexec_fn=drop, capture_output=True, **kw)


def prepare_workspace(job, pw):
    """Extrai a cópia do projeto (veio cifrada junto com a missão) e marca o ponto de partida no git."""
    import base64, io, tarfile
    blob = job.pop("workspace_tgz", None)
    if not blob:
        return None
    work = os.path.join(pw.pw_dir, "work")
    os.makedirs(work, exist_ok=True)
    with tarfile.open(fileobj=io.BytesIO(base64.b64decode(blob)), mode="r:gz") as tf:
        safe = []
        for m in tf.getmembers():                       # só arquivos e pastas, sem caminho absoluto, ../ ou links
            name = os.path.normpath(m.name)
            if (m.isfile() or m.isdir()) and not name.startswith(("/", "..")) and ".." not in name.split(os.sep):
                m.mode = (m.mode & 0o755) | 0o600 if m.isfile() else 0o755
                safe.append(m)
        tf.extractall(work, members=safe)
    subprocess.run(["chown", "-R", f"{pw.pw_uid}:{pw.pw_gid}", work], check=True)
    as_agent(pw, ["git", "init", "-q"], work)
    # artefatos gerados pelo próprio subagente (testes, builds) não voltam no patch
    with open(os.path.join(work, ".git", "info", "exclude"), "a") as f:
        f.write("\n".join(JUNK) + "\n")
    for argv in (["git", "add", "-A"], ["git", "commit", "-qm", "wisp: base", "--allow-empty"]):
        as_agent(pw, argv, work)
    return work


def collect_patch(work, pw):
    as_agent(pw, ["git", "add", "-A"], work)
    diff = as_agent(pw, ["git", "diff", "--cached", "--binary", "HEAD"], work).stdout
    stat = as_agent(pw, ["git", "diff", "--cached", "--stat", "HEAD"], work).stdout.decode("utf-8", "replace")
    if len(diff) > MAX_PATCH:
        return {"patch": None, "patch_stat": stat[-4000:], "patch_error": f"patch grande demais ({len(diff) // 1024} KB)"}
    return {"patch": diff.decode("utf-8", "replace") if diff else "", "patch_stat": stat[-4000:]}


def setup_scratch(pw):
    """Home do agente e /tmp em tmpfs do tamanho da RAM da enclave (o rootfs sozinho deixa ~1 GB livre).
    tmpfs só ocupa memória com o que for escrito; o limite é o teto. Em dev (container sem privilégio) segue sem."""
    total_mib, _ = mem()
    size = f"size={int(total_mib * 0.9)}m"
    try:
        skel = "/opt/wisp/home-skel"
        shutil.copytree(pw.pw_dir, skel, symlinks=True, dirs_exist_ok=True)
        subprocess.run(["mount", "-t", "tmpfs", "-o", f"{size},mode=0755", "tmpfs", pw.pw_dir], check=True, capture_output=True)
        shutil.copytree(skel, pw.pw_dir, symlinks=True, dirs_exist_ok=True)
        subprocess.run(["chown", "-R", f"{pw.pw_uid}:{pw.pw_gid}", pw.pw_dir], check=True)
        subprocess.run(["mount", "-t", "tmpfs", "-o", f"{size},mode=1777", "tmpfs", "/tmp"], check=True, capture_output=True)
        log("scratch em tmpfs:", size)
    except (OSError, subprocess.CalledProcessError) as e:
        log("scratch sem tmpfs:", e)


LOG_LINE_MAX = 4000            # por linha
LOG_TOTAL_MAX = 4 * 1024 * 1024
STDOUT_KEEP = 2 * 1024 * 1024  # o resultado leva só o fim da saída (o cliente precisa das últimas linhas)


class LiveLog:
    """Linhas de stdout/stderr do agente, cifradas para o cliente e mandadas em lotes pela hospedeira."""

    def __init__(self, session, ctl, started):
        self.session, self.ctl, self.started = session, ctl, started
        self.buf, self.seq, self.sent = [], 0, 0
        self.lock = threading.Lock()

    def add(self, stream, line):
        if self.sent >= LOG_TOTAL_MAX:
            return
        line = line.rstrip("\n")
        if not line:
            return
        with self.lock:
            self.buf.append({"s": stream, "t": round(time.time() - self.started, 1), "l": line[:LOG_LINE_MAX]})

    def flush(self):
        with self.lock:
            batch, self.buf = self.buf, []
        if not batch:
            return
        data = json.dumps(batch).encode()
        self.sent += len(data)
        if self.sent >= LOG_TOTAL_MAX:
            data = json.dumps(batch + [{"s": "wisp", "t": batch[-1]["t"], "l": "live log limit reached"}]).encode()
        self.seq += 1
        send_frame(self.ctl, {"type": "log", "seq": self.seq, "sealed": self.session.seal_log(data)})


class Terminals:
    """Terminais cifrados abertos pelo cliente (`ramwisp ssh`): bash num PTY, como o usuário do agente, na pasta
    do projeto. Só quem tem a chave do cliente abre uma sessão (TtyChannel); sid usado uma vez por vida da enclave,
    então um repasse de sessão antiga é ignorado. Morrem junto com a enclave."""

    MAX = 4

    def __init__(self, session, ctl):
        self.session, self.ctl = session, ctl
        self.live, self.used, self.lock = {}, set(), threading.Lock()
        self.pw = self.env = self.cwd = None

    def configure(self, pw, env, cwd):
        self.pw, self.env, self.cwd = pw, env, cwd

    def handle(self, frame):
        try:
            sid = unb64(frame["sid"])
        except Exception:
            return
        with self.lock:
            s = self.live.get(sid)
        if s is None:
            if self.pw is None or len(sid) != 16 or sid in self.used or len(self.live) >= self.MAX:
                return
            ch = TtyChannel(self.session, sid)
            try:
                msg = json.loads(ch.open(frame))
            except Exception:
                return                                  # não é do cliente: ignora sem queimar o sid
            if msg.get("t") == "open":
                self.used.add(sid)
                self.start(sid, ch, msg)
            return
        try:
            msg = json.loads(s["ch"].open(frame))
        except Exception:
            return
        t = msg.get("t")
        try:
            if t == "d":
                os.write(s["fd"], base64.b64decode(msg["d"]))
            elif t == "r":
                self.resize(s["fd"], msg)
            elif t == "x":
                os.killpg(s["proc"].pid, signal.SIGHUP)
        except OSError:
            pass

    @staticmethod
    def resize(fd, msg):
        rows, cols = max(1, min(int(msg.get("rows", 24)), 1000)), max(1, min(int(msg.get("cols", 80)), 1000))
        fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))

    def start(self, sid, ch, msg):
        master, slave = os.openpty()
        self.resize(master, msg)
        pw = self.pw
        cmd = msg.get("cmd")
        argv = ["bash", "-lc", str(cmd)] if cmd else ["bash", "-l"]

        def child():
            os.setsid()
            fcntl.ioctl(0, termios.TIOCSCTTY, 0)
            os.setgroups([]); os.setgid(pw.pw_gid); os.setuid(pw.pw_uid)
        env = {**self.env, "TERM": str(msg.get("term") or "xterm-256color")[:40]}
        proc = subprocess.Popen(argv, stdin=slave, stdout=slave, stderr=slave, env=env, cwd=self.cwd,
                                preexec_fn=child, close_fds=True)
        os.close(slave)
        s = {"ch": ch, "fd": master, "proc": proc}
        with self.lock:
            self.live[sid] = s
        threading.Thread(target=self.pump, args=(sid, s), daemon=True).start()

    def pump(self, sid, s):
        send = lambda obj: send_frame(self.ctl, {"type": "tty", "f": s["ch"].seal(json.dumps(obj).encode())})
        try:
            send({"t": "ready", "cwd": self.cwd})
            while True:
                try:
                    data = os.read(s["fd"], 16384)
                except OSError:
                    break                               # EIO: o shell fechou
                if not data:
                    break
                while len(data) < 65536 and select.select([s["fd"]], [], [], 0.015)[0]:
                    try:
                        more = os.read(s["fd"], 16384)
                    except OSError:
                        break
                    if not more:
                        break
                    data += more
                send({"t": "d", "d": base64.b64encode(data).decode()})
            send({"t": "exit", "code": s["proc"].wait()})
        except OSError:
            pass
        finally:
            with self.lock:
                self.live.pop(sid, None)
            try:
                os.close(s["fd"])
            except OSError:
                pass


def read_ctl(ctl, terminals, acked):
    """Durante a execução, tudo o que a hospedeira manda: quadros de terminal e o ack final."""
    while True:
        try:
            fr = recv_frame(ctl)
        except (ConnectionError, OSError, ValueError):
            acked.set(); return
        if fr.get("op") == "tty" and isinstance(fr.get("f"), dict):
            terminals.handle(fr["f"])
        elif fr.get("op") == "ack":
            acked.set(); return


def run_agent(job, ctl, session, terminals):
    pw = pwd.getpwnam(AGENT_USER)
    setup_scratch(pw)
    work = prepare_workspace(job, pw)
    if work:
        job["mission"] = job["mission"] + WORKSPACE_NOTE
    extra, cmd = build_command(job)
    proxy = f"http://{PROXY[0]}:{PROXY[1]}"
    env = {"PATH": "/usr/local/bin:/usr/bin:/bin", "HOME": pw.pw_dir, "USER": AGENT_USER, "LANG": "C.UTF-8",
           "DISABLE_AUTOUPDATER": "1", "MISSAO": job["mission"],
           # sem telemetria de terceiros saindo da enclave (só a API do modelo e o que a missão pedir)
           "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1", "DISABLE_TELEMETRY": "1", "DISABLE_ERROR_REPORTING": "1",
           "HTTPS_PROXY": proxy, "HTTP_PROXY": proxy, "https_proxy": proxy, "http_proxy": proxy,
           "NO_PROXY": "localhost,127.0.0.1", "no_proxy": "localhost,127.0.0.1", **extra}

    # o terminal do cliente enxerga o mesmo ambiente, menos a tarefa e a credencial
    terminals.configure(pw, {k: v for k, v in env.items() if k != "MISSAO" and k not in extra}, work or pw.pw_dir)

    def drop():
        os.setgroups([]); os.setgid(pw.pw_gid); os.setuid(pw.pw_uid); os.chdir(work or pw.pw_dir)

    started = time.time()
    p = subprocess.Popen(["sh", "-c", cmd], env=env, preexec_fn=drop,
                         stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
    live = LiveLog(session, ctl, started)
    out, err = [], []

    def pump(stream, name, keep):
        for raw in iter(stream.readline, b""):
            line = raw.decode("utf-8", "replace")
            keep.append(line)
            live.add(name, line)
    readers = [threading.Thread(target=pump, args=(s, n, b), daemon=True)
               for s, n, b in ((p.stdout, "out", out), (p.stderr, "err", err))]
    for r in readers:
        r.start()
    peak, last_stat = 0, 0
    try:
        while p.poll() is None:
            if time.time() - last_stat >= 5:
                total, used = mem()
                peak = max(peak, used)
                send_frame(ctl, {"type": "stat", "mem_total_mib": total, "mem_used_mib": used,
                                 "elapsed_s": int(time.time() - started)})
                last_stat = time.time()
            live.flush()
            time.sleep(1)
        for r in readers:
            r.join()
        live.flush()
    except OSError:
        os.killpg(p.pid, signal.SIGKILL); raise
    stdout = "".join(out)
    if len(stdout) > STDOUT_KEEP:
        stdout = stdout[-STDOUT_KEEP:].split("\n", 1)[-1]
    result = {"stdout": stdout,
            "stderr_tail": "".join(err)[-4000:],
            "exit_code": p.returncode, "duration_s": round(time.time() - started, 1), "peak_mem_mib": peak}
    if work:
        result.update(collect_patch(work, pw))
    return result


# ---------------------------------------------------------------- ciclo de vida

def main():
    try:
        subprocess.run(["ip", "link", "set", "lo", "up"], check=False, capture_output=True)
    except FileNotFoundError:
        pass
    start_proxy()
    srv = listen_ctl()
    log("pronta, esperando a hospedeira")
    ctl, _ = srv.accept()
    hello = recv_frame(ctl)
    assert hello.get("op") == "hello", hello
    session = EnclaveSession(unb64(hello["nonce"]))
    doc = nsm.attest(session.pub, session.nonce, b"wisp-v1")
    send_frame(ctl, {"type": "attestation", "document": b64(doc)})
    log("atestação enviada, esperando a entrada selada")
    msg = recv_frame(ctl)
    assert msg.get("op") == "run", msg.get("op")
    try:
        job = json.loads(session.open_input(msg["sealed"]))
    except Exception:
        send_frame(ctl, {"type": "error", "error": "entrada selada inválida"}); return
    del msg
    terminals, acked = Terminals(session, ctl), threading.Event()
    threading.Thread(target=read_ctl, args=(ctl, terminals, acked), daemon=True).start()
    try:
        result = run_agent(job, ctl, session, terminals)
    except Exception as e:
        result = {"stdout": "", "stderr_tail": f"falha ao rodar o agente: {e}", "exit_code": 125}
    job.clear()                                        # melhor esforço: a memória some com a enclave de qualquer jeito
    stats = {k: result.get(k) for k in ("exit_code", "duration_s", "peak_mem_mib")}
    send_frame(ctl, {"type": "result", "sealed": session.seal_output(json.dumps(result).encode()), "meta": stats})
    acked.wait(60)                                     # ack da hospedeira antes de morrer
    log("fim")


if __name__ == "__main__":
    main()
