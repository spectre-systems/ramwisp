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
import json, os, pwd, select, shlex, signal, socket, struct, subprocess, sys, threading, time

import nsm
from sealed import EnclaveSession, b64, unb64

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


def send_frame(sock, obj):
    data = json.dumps(obj).encode()
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
        cmd = (f'timeout {t} claude -p "$MISSAO" --output-format json --max-turns {int(job.get("turns", 20))} '
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


def run_agent(job, ctl):
    extra, cmd = build_command(job)
    pw = pwd.getpwnam(AGENT_USER)
    proxy = f"http://{PROXY[0]}:{PROXY[1]}"
    env = {"PATH": "/usr/local/bin:/usr/bin:/bin", "HOME": pw.pw_dir, "USER": AGENT_USER, "LANG": "C.UTF-8",
           "DISABLE_AUTOUPDATER": "1", "MISSAO": job["mission"],
           # sem telemetria de terceiros saindo da enclave (só a API do modelo e o que a missão pedir)
           "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1", "DISABLE_TELEMETRY": "1", "DISABLE_ERROR_REPORTING": "1",
           "HTTPS_PROXY": proxy, "HTTP_PROXY": proxy, "https_proxy": proxy, "http_proxy": proxy,
           "NO_PROXY": "localhost,127.0.0.1", "no_proxy": "localhost,127.0.0.1", **extra}

    def drop():
        os.setgroups([]); os.setgid(pw.pw_gid); os.setuid(pw.pw_uid); os.chdir(pw.pw_dir)

    started = time.time()
    p = subprocess.Popen(["sh", "-c", cmd], env=env, preexec_fn=drop,
                         stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
    out, err = [], []
    readers = [threading.Thread(target=lambda s=s, b=b: b.append(s.read()), daemon=True)
               for s, b in ((p.stdout, out), (p.stderr, err))]
    for r in readers:
        r.start()
    peak = 0
    while p.poll() is None:
        total, used = mem()
        peak = max(peak, used)
        try:
            send_frame(ctl, {"type": "stat", "mem_total_mib": total, "mem_used_mib": used,
                             "elapsed_s": int(time.time() - started)})
        except OSError:
            os.killpg(p.pid, signal.SIGKILL); raise
        time.sleep(5)
    for r in readers:
        r.join()
    return {"stdout": (out[0] if out else b"").decode("utf-8", "replace"),
            "stderr_tail": (err[0] if err else b"").decode("utf-8", "replace")[-4000:],
            "exit_code": p.returncode, "duration_s": round(time.time() - started, 1), "peak_mem_mib": peak}


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
    try:
        result = run_agent(job, ctl)
    except Exception as e:
        result = {"stdout": "", "stderr_tail": f"falha ao rodar o agente: {e}", "exit_code": 125}
    job.clear()                                        # melhor esforço: a memória some com a enclave de qualquer jeito
    stats = {k: result.get(k) for k in ("exit_code", "duration_s", "peak_mem_mib")}
    send_frame(ctl, {"type": "result", "sealed": session.seal_output(json.dumps(result).encode()), "meta": stats})
    try:
        recv_frame(ctl)                                # ack da hospedeira antes de morrer
    except (ConnectionError, OSError, ValueError):
        pass
    log("fim")


if __name__ == "__main__":
    main()
