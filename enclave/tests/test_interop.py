#!/usr/bin/env python3
"""O canal selado tem duas implementações: enclave/sealed.py (dentro da enclave) e mcp/src/crypto.js (no cliente).
Este teste cifra de um lado e abre do outro, nos dois sentidos, e confere que AAD trocado é recusado."""
import base64, json, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
from sealed import EnclaveSession, TtyChannel, b64, unb64  # noqa: E402

STDIN = "const i = JSON.parse(await new Promise((r) => { let s = ''; process.stdin.on('data', (d) => s += d).on('end', () => r(s)); }));"
CRYPTO = "file://" + os.path.join(os.path.dirname(os.path.dirname(HERE)), "mcp", "src", "crypto.js")


def node(js, stdin):
    r = subprocess.run(["node", "--input-type=module", "-e", js], input=json.dumps(stdin), capture_output=True, text=True)
    if r.returncode:
        raise SystemExit(f"node falhou:\n{r.stderr}")
    return json.loads(r.stdout)


def main():
    nonce = os.urandom(32)
    enc = EnclaveSession(nonce)
    # cliente (JS): gera a chave, sela a entrada para a enclave
    c = node(f"""
      import {{ newClientKey, exportKey, sealInput }} from "{CRYPTO}";
      {STDIN}
      const priv = newClientKey();
      const sealed = sealInput(priv, Buffer.from(i.enc_pub, "base64"), Buffer.from(i.nonce, "base64"), Buffer.from("tarefa secreta ✓"));
      console.log(JSON.stringify({{ priv: exportKey(priv), sealed }}));
    """, {"enc_pub": b64(enc.pub), "nonce": b64(nonce)})
    assert enc.open_input(c["sealed"]).decode() == "tarefa secreta ✓", "enclave não abriu a entrada do cliente"

    # enclave (Python) sela resultado e log; o cliente (JS) abre cada um só com o AAD certo
    out = enc.seal_output(b"resultado \xe2\x9c\x93")
    log = enc.seal_log(b'[{"s":"out","l":"linha"}]')
    r = node(f"""
      import {{ importKey, openOutput }} from "{CRYPTO}";
      {STDIN}
      const k = importKey(i.priv), pub = Buffer.from(i.enc_pub, "base64"), n = Buffer.from(i.nonce, "base64");
      const res = {{ out: openOutput(k, pub, n, i.out).toString(), log: openOutput(k, pub, n, i.log, " log").toString() }};
      try {{ openOutput(k, pub, n, i.log); res.cross = "aceitou"; }} catch {{ res.cross = "recusou"; }}
      console.log(JSON.stringify(res));
    """, {"priv": c["priv"], "enc_pub": b64(enc.pub), "nonce": b64(nonce), "out": out, "log": log})
    assert r["out"] == "resultado ✓", r
    assert r["log"] == '[{"s":"out","l":"linha"}]', r
    assert r["cross"] == "recusou", "um trecho de log não pode passar por resultado"

    # terminal: cliente (JS) abre sessão e manda 2 quadros; a enclave (Python) abre, responde; replay é recusado
    t = node(f"""
      import {{ importKey, TtyChannel }} from "{CRYPTO}";
      {STDIN}
      const ch = new TtyChannel(importKey(i.priv), Buffer.from(i.enc_pub, "base64"), Buffer.from(i.nonce, "base64"));
      const frames = [ch.seal(Buffer.from('{{"t":"open"}}')), ch.seal(Buffer.from("ls -la\\n"))];
      console.log(JSON.stringify({{ sid: ch.sid.toString("base64"), frames }}));
    """, {"priv": c["priv"], "enc_pub": b64(enc.pub), "nonce": b64(nonce)})
    tty = TtyChannel(enc, unb64(t["sid"]))
    assert tty.open(t["frames"][0]) == b'{"t":"open"}'
    assert tty.open(t["frames"][1]) == b"ls -la\n"
    try:
        tty.open(t["frames"][1]); raise AssertionError("replay aceito")
    except ValueError:
        pass
    back = [tty.seal(b"total 8\r\n"), tty.seal(b"$ ")]
    r2 = node(f"""
      import {{ importKey, TtyChannel }} from "{CRYPTO}";
      {STDIN}
      const ch = new TtyChannel(importKey(i.priv), Buffer.from(i.enc_pub, "base64"), Buffer.from(i.nonce, "base64"), Buffer.from(i.sid, "base64"));
      const out = i.back.map((f) => ch.open(f).toString());
      let replay = "recusou"; try {{ ch.open(i.back[0]); replay = "aceitou"; }} catch {{}}
      let other = "recusou"; try {{ new TtyChannel(importKey(i.priv), Buffer.from(i.enc_pub, "base64"), Buffer.from(i.nonce, "base64")).open(i.back[0]); other = "aceitou"; }} catch {{}}
      console.log(JSON.stringify({{ out, replay, other }}));
    """, {"priv": c["priv"], "enc_pub": b64(enc.pub), "nonce": b64(nonce), "sid": t["sid"], "back": back})
    assert r2["out"] == ["total 8\r\n", "$ "], r2
    assert r2["replay"] == "recusou" and r2["other"] == "recusou", r2
    print("interop ok: entrada JS→Python, resultado e log Python→JS, AAD separado, terminal nos dois sentidos, replay e sessão alheia recusados")


if __name__ == "__main__":
    main()
