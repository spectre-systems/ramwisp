// Confere o documento de atestação da enclave ANTES de qualquer segredo sair desta máquina.
// Raiz confiável: AWS Nitro Enclaves Root G1 (nitro-root-g1.pem, sha256 do zip oficial conferido).
// Imagens aceitas: PCR0 em pcrs.json (hash da imagem publicada da enclave).
import { X509Certificate, createHash, verify } from "node:crypto";
import { readFileSync } from "node:fs";
import { decode, encodeSigStructure } from "./cbor.js";

const here = new URL("..", import.meta.url);
const NITRO_ROOT = new X509Certificate(readFileSync(new URL("nitro-root-g1.pem", here)));
const DEV_PCR0 = createHash("sha384").update("wisp-dev-image").digest("hex");
const MAX_AGE_MS = 15 * 60_000;

export function allowedPcr0() {
  const extra = (process.env.WISP_EXTRA_PCR0 ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const pinned = JSON.parse(readFileSync(new URL("pcrs.json", here), "utf8")).pcr0 ?? [];
  return [...pinned.map((p) => p.toLowerCase()), ...extra];
}

/**
 * @returns {{enclavePub: Buffer, pcr0: string, moduleId: string, timestamp: number, dev: boolean}}
 * Lança erro se QUALQUER coisa não bater.
 */
export function verifyAttestation(docB64, expectedNonce, { devRootPem } = {}) {
  const doc = decode(Buffer.from(docB64, "base64"));
  if (!Array.isArray(doc) || doc.length !== 4) throw new Error("attestation: not a COSE_Sign1");
  const [protectedBytes, , payloadBytes, signature] = doc;
  const prot = decode(protectedBytes);
  if (!(prot instanceof Map) || prot.get(1) !== -35) throw new Error("attestation: algorithm is not ES384");
  const p = decode(payloadBytes);
  const get = (k) => { const v = p.get(k); if (v === undefined || v === null) throw new Error(`attestation: missing ${k}`); return v; };

  // cadeia: cabundle[0] é a raiz, depois intermediárias, por fim o certificado da enclave
  const bundle = get("cabundle").map((der) => new X509Certificate(der));
  const leaf = new X509Certificate(get("certificate"));
  const dev = !!devRootPem;
  const root = dev ? new X509Certificate(devRootPem) : NITRO_ROOT;
  if (!bundle.length || !bundle[0].raw.equals(root.raw)) throw new Error("attestation: root is not AWS Nitro Enclaves");
  const chain = [...bundle, leaf];
  const at = new Date();
  for (let i = 0; i < chain.length; i++) {
    const cert = chain[i];
    const issuer = i === 0 ? root : chain[i - 1];
    if (!cert.verify(issuer.publicKey)) throw new Error(`attestation: certificate ${i} signature invalid`);
    if (at < new Date(cert.validFrom) || at > new Date(cert.validTo)) throw new Error(`attestation: certificate ${i} outside its validity`);
    if (i < chain.length - 1 && !cert.ca) throw new Error(`attestation: certificate ${i} is not a CA`);
  }
  const ok = verify("sha384", encodeSigStructure(protectedBytes, payloadBytes),
    { key: leaf.publicKey, dsaEncoding: "ieee-p1363" }, signature);
  if (!ok) throw new Error("attestation: invalid COSE signature");

  if (get("digest") !== "SHA384") throw new Error("attestation: unexpected digest");
  const ts = get("timestamp");
  if (Math.abs(Date.now() - ts) > MAX_AGE_MS) throw new Error("attestation: too old or from the future");
  if (!Buffer.from(get("nonce")).equals(expectedNonce)) throw new Error("attestation: nonce mismatch (replay?)");
  const ud = p.get("user_data");
  if (!ud || Buffer.from(ud).toString() !== "wisp-v1") throw new Error("attestation: unknown protocol");
  const enclavePub = Buffer.from(get("public_key"));
  if (enclavePub.length !== 32) throw new Error("attestation: invalid public key");

  const pcr0 = Buffer.from(get("pcrs").get(0)).toString("hex");
  if (/^0+$/.test(pcr0)) throw new Error("attestation: enclave in debug mode (zero PCR0) — refused");
  const allowed = dev ? [DEV_PCR0] : allowedPcr0();
  if (!allowed.includes(pcr0)) throw new Error(`attestation: unrecognized image (PCR0 ${pcr0.slice(0, 16)}…)`);
  return { enclavePub, pcr0, moduleId: get("module_id"), timestamp: ts, dev };
}
