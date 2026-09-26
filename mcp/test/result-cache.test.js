// O resultado recolhido uma vez continua legível: a segunda chamada devolve a cópia local em vez de "already collected".
import assert from "node:assert/strict";
import { createCipheriv, createPublicKey, diffieHellman, generateKeyPairSync, hkdfSync, randomBytes } from "node:crypto";
import { mkdtempSync, readdirSync, statSync, utimesSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const V = Buffer.from("wisp-v1");
const raw = (k) => Buffer.from(createPublicKey(k).export({ format: "jwk" }).x, "base64url");

/** Lado da enclave de enclave/sealed.py, só para o teste. */
function sealOutput(enclavePriv, clientPubRaw, nonce, plaintext) {
  const clientPub = createPublicKey({ key: { kty: "OKP", crv: "X25519", x: clientPubRaw.toString("base64url") }, format: "jwk" });
  const shared = diffieHellman({ privateKey: enclavePriv, publicKey: clientPub });
  const info = Buffer.concat([V, Buffer.from(" out"), raw(enclavePriv), clientPubRaw]);
  const k = Buffer.from(hkdfSync("sha256", shared, nonce, info, 32));
  const iv = randomBytes(12);
  const c = createCipheriv("chacha20-poly1305", k, iv, { authTagLength: 16 });
  c.setAAD(Buffer.concat([V, Buffer.from(" out")]), { plaintextLength: plaintext.length });
  return { iv: iv.toString("base64"), ct: Buffer.concat([c.update(plaintext), c.final(), c.getAuthTag()]).toString("base64") };
}

test("a collected result is returned again, and concurrent calls share one collection", async () => {
  const dir = mkdtempSync(join(tmpdir(), "wisp-test-"));
  const job = { id: "wp-test1", status: "done", ram_gb: 4, cost_cents: 1.3, output: null, collected_at: null };
  let collects = 0;
  const srv = createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.method === "GET" && req.url === `/api/jobs/${job.id}`) return res.end(JSON.stringify(job));
    if (req.method === "POST" && req.url === `/api/jobs/${job.id}/collected`) {
      collects++; job.output = null; job.collected_at = Date.now(); return res.end("{}");
    }
    res.statusCode = 404; res.end("{}");
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  process.env.WISP_CONFIG_DIR = dir;
  process.env.WISP_API = `http://127.0.0.1:${srv.address().port}`;
  process.env.WISP_TOKEN = "wsp_test";
  const { exportKey, newClientKey } = await import("../src/crypto.js");
  const { writeSecret, ensureDir } = await import("../src/account.js");
  const { result, waitAgent, RESULT_TTL_MS } = await import("../src/client.js");

  const client = newClientKey();
  const { privateKey: enclave } = generateKeyPairSync("x25519");
  const nonce = randomBytes(32);
  writeSecret(join(ensureDir("jobs"), `${job.id}.json`), JSON.stringify({ id: job.id, priv: exportKey(client),
    nonce: nonce.toString("base64"), engine: "claude", enclave_pub: raw(enclave).toString("base64") }));
  const stdout = JSON.stringify({ type: "result", result: "42 markets scraped", is_error: false });
  job.output = sealOutput(enclave, raw(client), nonce, Buffer.from(JSON.stringify({ stdout, exit_code: 0, duration_s: 9.5 })));

  try {
    // a espera "em segundo plano" e uma leitura direta ao mesmo tempo
    const [a, b] = await Promise.all([waitAgent(job.id, 5), result(job.id)]);
    assert.equal(a.result, "42 markets scraped");
    assert.equal(b.result, "42 markets scraped");
    assert.equal(collects, 1, "the server is told only once");
    assert.equal(job.output, null, "the sealed copy on the server is gone");
    assert.deepEqual(readdirSync(join(dir, "jobs")), [], "the key is deleted after opening");

    // mais tarde, outra chamada: a resposta ainda está aqui
    const again = await result(job.id);
    assert.equal(again.result, "42 markets scraped");
    assert.equal(again.from_local_copy, true);
    const f = join(dir, "results", `${job.id}.json`);
    assert.equal(statSync(f).mode & 0o777, 0o600);

    // depois de 7 dias a cópia some e vale a mensagem do servidor
    const old = (Date.now() - RESULT_TTL_MS - 60_000) / 1000;
    utimesSync(f, old, old);
    const expired = await result(job.id);
    assert.match(expired.error, /already collected/);
  } finally {
    srv.close();
  }
});
