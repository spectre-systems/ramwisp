// Canal selado wisp-v1 (mesma especificação de enclave/sealed.py).
import { createCipheriv, createDecipheriv, createPrivateKey, createPublicKey, diffieHellman, generateKeyPairSync,
  hkdfSync, randomBytes } from "node:crypto";

const V = Buffer.from("wisp-v1");
const rawPub = (pub) => Buffer.from(pub.export({ format: "jwk" }).x, "base64url");
const pubFromRaw = (raw) => createPublicKey({ key: { kty: "OKP", crv: "X25519", x: Buffer.from(raw).toString("base64url") }, format: "jwk" });

export function newClientKey() {
  const { privateKey } = generateKeyPairSync("x25519");
  return privateKey;
}

export const exportKey = (priv) => priv.export({ format: "der", type: "pkcs8" }).toString("base64");
export const importKey = (b64) => createPrivateKey({ key: Buffer.from(b64, "base64"), format: "der", type: "pkcs8" });

function key(priv, enclavePub, nonce, direction) {
  const clientPub = rawPub(createPublicKey(priv));
  const shared = diffieHellman({ privateKey: priv, publicKey: pubFromRaw(enclavePub) });
  const info = Buffer.concat([V, Buffer.from(" "), Buffer.from(direction), enclavePub, clientPub]);
  return { k: Buffer.from(hkdfSync("sha256", shared, nonce, info, 32)), clientPub };
}

export function sealInput(priv, enclavePub, nonce, plaintext) {
  const { k, clientPub } = key(priv, enclavePub, nonce, "in");
  const iv = randomBytes(12);
  const c = createCipheriv("chacha20-poly1305", k, iv, { authTagLength: 16 });
  c.setAAD(Buffer.concat([V, Buffer.from(" in")]), { plaintextLength: plaintext.length });
  const ct = Buffer.concat([c.update(plaintext), c.final(), c.getAuthTag()]);
  k.fill(0);
  return { c_pub: clientPub.toString("base64"), iv: iv.toString("base64"), ct: ct.toString("base64") };
}

export function openOutput(priv, enclavePub, nonce, msg, aad = " out") {
  const { k } = key(priv, enclavePub, nonce, "out");
  const data = Buffer.from(msg.ct, "base64");
  const d = createDecipheriv("chacha20-poly1305", k, Buffer.from(msg.iv, "base64"), { authTagLength: 16 });
  d.setAAD(Buffer.concat([V, Buffer.from(aad)]), { plaintextLength: data.length - 16 });
  d.setAuthTag(data.subarray(data.length - 16));
  return Buffer.concat([d.update(data.subarray(0, data.length - 16)), d.final()]);
}

/**
 * Terminal cifrado (wisp-v1 tty), lado do cliente — espelho de TtyChannel em enclave/sealed.py.
 * Chaves por sessão (sid aleatório), nonce = contador de 64 bits por direção, estritamente crescente.
 */
export class TtyChannel {
  constructor(priv, enclavePub, nonce, sid = randomBytes(16)) {
    this.sid = sid;
    this.tx = key(priv, enclavePub, nonce, Buffer.concat([Buffer.from("tty-in"), sid])).k;
    this.rx = key(priv, enclavePub, nonce, Buffer.concat([Buffer.from("tty-out"), sid])).k;
    this.txN = 0n; this.rxN = -1n;
  }
  static iv(n) { const b = Buffer.alloc(12); b.writeBigUInt64BE(n, 4); return b; }
  seal(plaintext) {
    const n = this.txN++;
    const c = createCipheriv("chacha20-poly1305", this.tx, TtyChannel.iv(n), { authTagLength: 16 });
    c.setAAD(Buffer.concat([V, Buffer.from(" tty")]), { plaintextLength: plaintext.length });
    return { sid: this.sid.toString("base64"), n: Number(n), ct: Buffer.concat([c.update(plaintext), c.final(), c.getAuthTag()]).toString("base64") };
  }
  open(frame) {
    const n = BigInt(frame.n);
    if (n <= this.rxN) throw new Error("tty frame replayed or out of order");
    const data = Buffer.from(frame.ct, "base64");
    const d = createDecipheriv("chacha20-poly1305", this.rx, TtyChannel.iv(n), { authTagLength: 16 });
    d.setAAD(Buffer.concat([V, Buffer.from(" tty")]), { plaintextLength: data.length - 16 });
    d.setAuthTag(data.subarray(data.length - 16));
    const pt = Buffer.concat([d.update(data.subarray(0, data.length - 16)), d.final()]);
    this.rxN = n;
    return pt;
  }
}
