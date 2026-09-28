#!/usr/bin/env python3
"""Hospedeira de um job (roda na EC2 efêmera; só biblioteca padrão).

Não é confiável por desenho: tudo o que passa por aqui é cifrado para a enclave ou para o cliente.
Ela só sobe a enclave, dá saída de rede (TCP cego, host:porta) e repassa bytes para a API do wisp.

  python3 parent.py /etc/wisp/job.json          produção (Nitro Enclaves, vsock)
  python3 parent.py job.json --dev              dev: enclave = container docker sem rede, sockets unix
"""
import ipaddress, json, os, queue, select, socket, struct, subprocess, sys, tempfile, threading, time, urllib.request

ENCLAVE_CID, CTL_PORT, EGRESS_PORT = 16, 5005, 8001
ALLOWED_PORTS = {443, 80}
DEV = "--dev" in sys.argv
CFG = json.load(open([a for a in sys.argv[1:] if not a.startswith("--")][0]))
egress = {}                       # host:porta -> bytes (metadado, aparece no painel do cliente)
egress_lock = threading.Lock()


def log(*a):
    print(time.strftime("%H:%M:%S"), "[parent]", *a, file=sys.stderr, flush=True)


def api(method, path, body=None, timeout=40):
    url = CFG["api"].rstrip("/") + path
    data = json.dumps(body).encode() if body is not None else None
    for attempt in range(5):
        req = urllib.request.Request(url, data=data, method=method, headers={
            "Authorization": f"Bearer {CFG['job_token']}", "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                raw = r.read()
                return r.status, (json.loads(raw) if raw else None)
        except urllib.error.HTTPError as e:
            if e.code < 500:
                return e.code, None
        except OSError as e:
            log("api", path, e)
        time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"API inacessível: {path}")


def status(phase, **extra):
    api("POST", "/agent/status", {"phase": phase, **extra})


# ---------------------------------------------------------------- saída de rede da enclave

def resolve_public(host, port):
    for fam, _, _, _, addr in socket.getaddrinfo(host, port, type=socket.SOCK_STREAM):
        ip = ipaddress.ip_address(addr[0])
        if ip.is_global:                               # nada de 169.254.169.254, VPC, loopback...
            return fam, addr
    raise PermissionError("destino não público")


def handle_egress(c):
    try:
        line = b""
        while not line.endswith(b"\n") and len(line) < 300:
            ch = c.recv(1)
            if not ch:
                return c.close()
            line += ch
        host, _, port = line.decode().strip().rpartition(":")
        port = int(port)
        if port not in ALLOWED_PORTS:
            raise PermissionError(f"porta {port}")
        fam, addr = resolve_public(host, port)
        up = socket.socket(fam, socket.SOCK_STREAM); up.settimeout(15); up.connect(addr); up.settimeout(None)
        c.sendall(b"OK\n")
    except Exception as e:
        try:
            c.sendall(f"NO {e}\n".encode()); c.close()
        except OSError:
            pass
        return
    key, n = f"{host}:{port}", 0
    try:
        while True:
            r, _, _ = select.select([c, up], [], [], 600)
            if not r:
                break
            done = False
            for s in r:
                data = s.recv(65536)
                if not data:
                    done = True; break
                (up if s is c else c).sendall(data); n += len(data)
            if done:
                break
    except OSError:
        pass
    finally:
        c.close(); up.close()
        with egress_lock:
            egress[key] = egress.get(key, 0) + n


def serve_egress(sock_dir):
    if DEV:
        path = os.path.join(sock_dir, "egress")
        srv = socket.socket(socket.AF_UNIX); srv.bind(path); os.chmod(path, 0o666)
    else:
        srv = socket.socket(socket.AF_VSOCK, socket.SOCK_STREAM); srv.bind((socket.VMADDR_CID_ANY, EGRESS_PORT))
    srv.listen(128)

    def loop():
        while True:
            c, _ = srv.accept()
            threading.Thread(target=handle_egress, args=(c,), daemon=True).start()
    threading.Thread(target=loop, daemon=True).start()


# ---------------------------------------------------------------- enclave

def start_enclave(sock_dir):
    mem, cpus = int(CFG["mem_mib"]), int(CFG["cpus"])
    if DEV:
        name = f"wisp-enc-{CFG['job_id']}"
        os.makedirs(CFG.get("dev_share", "/tmp/wisp-dev"), exist_ok=True)
        subprocess.run(["docker", "run", "-d", "--rm", "--name", name, "--network", "none",
                        "--memory", f"{mem}m", "--cpus", str(cpus), "-v", f"{sock_dir}:/sock",
                        "-e", "WISP_DEV=1", "-e", "WISP_DEV_CTL=/sock/ctl", "-e", "WISP_DEV_EGRESS=/sock/egress",
                        "-v", f"{CFG.get('dev_share', '/tmp/wisp-dev')}:/devshare",
                        "-e", "WISP_DEV_ROOT_OUT=/devshare/devroot.pem", CFG.get("dev_image", "wisp-enclave:dev")],
                       check=True, capture_output=True)
        return lambda: subprocess.run(["docker", "rm", "-f", name], capture_output=True)
    with open("/etc/nitro_enclaves/allocator.yaml", "w") as f:
        f.write(f"---\nmemory_mib: {mem}\ncpu_count: {cpus}\n")
    subprocess.run(["systemctl", "restart", "nitro-enclaves-allocator"], check=True)
    r = subprocess.run(["nitro-cli", "run-enclave", "--cpu-count", str(cpus), "--memory", str(mem),
                        "--eif-path", CFG["eif_path"], "--enclave-cid", str(ENCLAVE_CID)],
                       capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"nitro-cli: {r.stderr.strip() or r.stdout.strip()}")
    return lambda: subprocess.run(["nitro-cli", "terminate-enclave", "--all"], capture_output=True)


def dial_enclave(sock_dir, wait_s=180):
    deadline = time.time() + wait_s
    while True:
        try:
            if DEV:
                s = socket.socket(socket.AF_UNIX); s.connect(os.path.join(sock_dir, "ctl"))
            else:
                s = socket.socket(socket.AF_VSOCK, socket.SOCK_STREAM); s.connect((ENCLAVE_CID, CTL_PORT))
            return s
        except OSError:
            if time.time() > deadline:
                raise
            time.sleep(1)


SEND_LOCK = threading.Lock()


def send_frame(s, obj):
    d = json.dumps(obj).encode()
    with SEND_LOCK:
        s.sendall(struct.pack(">I", len(d)) + d)


class TtyRelay:
    """Terminal cifrado (`ramwisp ssh`): só repassa quadros que esta máquina não consegue abrir.
    Cliente → enclave: long-poll em /agent/tty/in. Enclave → cliente: fila e POST em lote em /agent/tty/out."""

    def __init__(self, ctl):
        self.ctl, self.out, self.stop = ctl, queue.Queue(), threading.Event()
        threading.Thread(target=self.pull, daemon=True).start()
        threading.Thread(target=self.push, daemon=True).start()

    def pull(self):
        while not self.stop.is_set():
            try:
                code, body = api("GET", "/agent/tty/in?wait=20", timeout=40)
            except RuntimeError:
                time.sleep(2); continue
            if code == 410:
                return
            for f in (body or {}).get("frames", []) if code == 200 else []:
                try:
                    send_frame(self.ctl, {"op": "tty", "f": f})
                except OSError:
                    return

    def push(self):
        while not self.stop.is_set():
            try:
                frames = [self.out.get(timeout=1)]
            except queue.Empty:
                continue
            while not self.out.empty() and len(frames) < 64:
                frames.append(self.out.get_nowait())
            try:
                api("POST", "/agent/tty/out", {"frames": frames})
            except RuntimeError as e:
                log("tty:", e)


def recv_frame(s):
    def exact(n):
        b = b""
        while len(b) < n:
            ch = s.recv(n - len(b))
            if not ch:
                raise ConnectionError("enclave fechou")
            b += ch
        return b
    return json.loads(exact(struct.unpack(">I", exact(4))[0]))


# ---------------------------------------------------------------- ciclo

def main():
    sock_dir = tempfile.mkdtemp(prefix="wisp-")
    os.chmod(sock_dir, 0o777)
    stop = lambda: None
    try:
        code, job = api("GET", "/agent/job")
        if code != 200:
            raise RuntimeError(f"job indisponível ({code})")
        serve_egress(sock_dir)
        status("enclave_starting")
        stop = start_enclave(sock_dir)
        ctl = dial_enclave(sock_dir)
        send_frame(ctl, {"op": "hello", "nonce": job["nonce"]})
        att = recv_frame(ctl)
        api("POST", "/agent/attestation", {"document": att["document"]})
        log("atestação publicada; esperando a entrada selada do cliente")
        deadline = time.time() + CFG.get("input_wait_s", 600)
        sealed = None
        while sealed is None:
            if time.time() > deadline:
                raise RuntimeError("cliente não mandou a entrada a tempo")
            code, body = api("GET", "/agent/input?wait=20", timeout=40)
            if code == 200 and body:
                sealed = body["sealed"]
        send_frame(ctl, {"op": "run", "sealed": sealed})
        del sealed
        status("running")
        tty = TtyRelay(ctl)
        while True:
            fr = recv_frame(ctl)
            if fr["type"] == "stat":
                with egress_lock:
                    eg = dict(egress)
                api("POST", "/agent/stats", {**{k: fr[k] for k in ("mem_total_mib", "mem_used_mib", "elapsed_s")},
                                              "egress": eg})
            elif fr["type"] == "tty":                   # quadro do terminal, cifrado para o cliente
                tty.out.put(fr["f"])
            elif fr["type"] == "log":                   # trecho do log ao vivo: cifrado para o cliente, só repassa
                api("POST", "/agent/log", {"seq": fr["seq"], "sealed": fr["sealed"]})
            elif fr["type"] == "result":
                with egress_lock:
                    eg = dict(egress)
                api("POST", "/agent/output", {"sealed": fr["sealed"], "meta": fr.get("meta", {}), "egress": eg})
                tty.stop.set()
                send_frame(ctl, {"op": "ack"})
                break
            elif fr["type"] == "error":
                raise RuntimeError(fr.get("error"))
        log("resultado entregue")
    except Exception as e:
        log("falha:", e)
        try:
            api("POST", "/agent/status", {"phase": "failed", "error": str(e)[:500]})
        except Exception:
            pass
    finally:
        stop()
        if not DEV:
            subprocess.run(["shutdown", "-h", "now"])   # InstanceInitiatedShutdownBehavior=terminate


if __name__ == "__main__":
    main()
