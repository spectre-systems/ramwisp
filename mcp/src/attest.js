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
  if (!Array.isArray(doc) || doc.length !== 4) throw new Error("atestação: não é COSE_Sign1");
  const [protectedBytes, , payloadBytes, signature] = doc;
  const prot = decode(protectedBytes);
  if (!(prot instanceof Map) || prot.get(1) !== -35) throw new Error("atestação: algoritmo não é ES384");
  const p = decode(payloadBytes);
  const get = (k) => { const v = p.get(k); if (v === undefined || v === null) throw new Error(`atestação: falta ${k}`); return v; };

  // cadeia: cabundle[0] é a raiz, depois intermediárias, por fim o certificado da enclave
  const bundle = get("cabundle").map((der) => new X509Certificate(der));
  const leaf = new X509Certificate(get("certificate"));
  const dev = !!devRootPem;
  const root = dev ? new X509Certificate(devRootPem) : NITRO_ROOT;
  if (!bundle.length || !bundle[0].raw.equals(root.raw)) throw new Error("atestação: raiz não é a AWS Nitro Enclaves");
  const chain = [...bundle, leaf];
  const at = new Date();
  for (let i = 0; i < chain.length; i++) {
    const cert = chain[i];
    const issuer = i === 0 ? root : chain[i - 1];
    if (!cert.verify(issuer.publicKey)) throw new Error(`atestação: assinatura do certificado ${i} inválida`);
    if (at < new Date(cert.validFrom) || at > new Date(cert.validTo)) throw new Error(`atestação: certificado ${i} fora da validade`);
    if (i < chain.length - 1 && !cert.ca) throw new Error(`atestação: certificado ${i} não é CA`);
  }
  const ok = verify("sha384", encodeSigStructure(protectedBytes, payloadBytes),
    { key: leaf.publicKey, dsaEncoding: "ieee-p1363" }, signature);
  if (!ok) throw new Error("atestação: assinatura COSE inválida");

  if (get("digest") !== "SHA384") throw new Error("atestação: digest inesperado");
  const ts = get("timestamp");
  if (Math.abs(Date.now() - ts) > MAX_AGE_MS) throw new Error("atestação: velha demais ou do futuro");
  if (!Buffer.from(get("nonce")).equals(expectedNonce)) throw new Error("atestação: nonce não confere (repetição?)");
  const ud = p.get("user_data");
  if (!ud || Buffer.from(ud).toString() !== "wisp-v1") throw new Error("atestação: protocolo desconhecido");
  const enclavePub = Buffer.from(get("public_key"));
  if (enclavePub.length !== 32) throw new Error("atestação: chave pública inválida");

  const pcr0 = Buffer.from(get("pcrs").get(0)).toString("hex");
  if (/^0+$/.test(pcr0)) throw new Error("atestação: enclave em modo debug (PCR0 zerado) — recusado");
  const allowed = dev ? [DEV_PCR0] : allowedPcr0();
  if (!allowed.includes(pcr0)) throw new Error(`atestação: imagem não reconhecida (PCR0 ${pcr0.slice(0, 16)}…)`);
  return { enclavePub, pcr0, moduleId: get("module_id"), timestamp: ts, dev };
}
