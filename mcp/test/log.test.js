// Log ao vivo: trechos cifrados como na enclave (AAD "log"), abertos aqui em ordem e mostrados em linhas legíveis.
import assert from "node:assert/strict";
import { createCipheriv, createPublicKey, diffieHellman, generateKeyPairSync, hkdfSync, randomBytes } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const V = Buffer.from("wisp-v1");
const raw = (k) => Buffer.from(createPublicKey(k).export({ format: "jwk" }).x, "base64url");
function seal(enclavePriv, clientPubRaw, nonce, plaintext, aad) {
  const clientPub = createPublicKey({ key: { kty: "OKP", crv: "X25519", x: clientPubRaw.toString("base64url") }, format: "jwk" });
  const shared = diffieHellman({ privateKey: enclavePriv, publicKey: clientPub });
  const k = Buffer.from(hkdfSync("sha256", shared, nonce, Buffer.concat([V, Buffer.from(" out"), raw(enclavePriv), clientPubRaw]), 32));
  const iv = randomBytes(12);
  const c = createCipheriv("chacha20-poly1305", k, iv, { authTagLength: 16 });
  c.setAAD(Buffer.concat([V, Buffer.from(aad)]), { plaintextLength: plaintext.length });
  return { iv: iv.toString("base64"), ct: Buffer.concat([c.update(plaintext), c.final(), c.getAuthTag()]).toString("base64") };
}

test("live log chunks are decrypted in order and rendered; a result-sealed chunk is refused", async () => {
  const dir = mkdtempSync(join(tmpdir(), "wisp-log-"));
  let entries = [];
  const srv = createServer((req, res) => {
    const after = Number(new URL(req.url, "http://x").searchParams.get("after"));
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ status: "running", entries: entries.filter((e) => e.seq > after) }));
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  Object.assign(process.env, { WISP_CONFIG_DIR: dir, WISP_API: `http://127.0.0.1:${srv.address().port}`, WISP_TOKEN: "wsp_t" });
  const { exportKey, newClientKey } = await import("../src/crypto.js");
  const { writeSecret, ensureDir } = await import("../src/account.js");
  const { readLog } = await import("../src/log.js");
  const client = newClientKey(), enclave = generateKeyPairSync("x25519").privateKey, nonce = randomBytes(32);
  writeSecret(join(ensureDir("jobs"), "wp-log.json"), JSON.stringify({ id: "wp-log", priv: exportKey(client),
    nonce: nonce.toString("base64"), enclave_pub: raw(enclave).toString("base64") }));
  const chunk = (seq, evs, aad = " log") => ({ seq, at: seq, sealed: seal(enclave, raw(client), nonce, Buffer.from(JSON.stringify(evs)), aad) });
  try {
    entries = [
      chunk(1, [{ s: "out", t: 2, l: JSON.stringify({ type: "system", subtype: "init", model: "claude-sonnet-5" }) }]),
      chunk(2, [{ s: "out", t: 5, l: JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "Bash", input: { command: "npx playwright install chromium" } }] } }) },
                { s: "err", t: 6, l: "npm warn deprecated" }]),
    ];
    const a = await readLog("wp-log");
    assert.equal(a.next, 2);
    assert.match(a.lines[0], /session started \(claude-sonnet-5\)/);
    assert.match(a.lines[1], /▶ Bash  npx playwright install chromium/);
    assert.match(a.lines[2], /! npm warn deprecated/);

    entries.push(chunk(3, [{ s: "out", t: 9, l: JSON.stringify({ type: "result", num_turns: 3, total_cost_usd: 0.02 }) }]));
    const b = await readLog("wp-log", a.next);
    assert.deepEqual(b.lines.length, 1, "only the new chunk");
    assert.match(b.lines[0], /✔ finished · 3 turns/);

    // um trecho selado como resultado (AAD "out") não passa por log
    entries.push(chunk(4, [{ s: "out", t: 1, l: "x" }], " out"));
    await assert.rejects(readLog("wp-log", 3));
  } finally {
    srv.close();
  }
});
