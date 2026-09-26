// Decodificador CBOR mínimo (RFC 8949) para o documento de atestação. Mapas viram Map (chaves podem ser inteiros).

export function decode(buf) {
  const b = Buffer.from(buf);
  const [v] = item(b, 0);
  return v;
}

function item(b, i) {
  const ib = b[i++];
  const major = ib >> 5, ai = ib & 31;
  if (major === 7) {
    if (ai === 20) return [false, i];
    if (ai === 21) return [true, i];
    if (ai === 22 || ai === 23) return [null, i];
    if (ai === 26) return [b.readFloatBE(i), i + 4];
    if (ai === 27) return [b.readDoubleBE(i), i + 8];
    throw new Error(`cbor: simple ${ai}`);
  }
  let n;
  if (ai < 24) n = ai;
  else if (ai === 24) { n = b[i]; i += 1; }
  else if (ai === 25) { n = b.readUInt16BE(i); i += 2; }
  else if (ai === 26) { n = b.readUInt32BE(i); i += 4; }
  else if (ai === 27) { n = Number(b.readBigUInt64BE(i)); i += 8; }
  else throw new Error("cbor: comprimento indefinido");
  switch (major) {
    case 0: return [n, i];
    case 1: return [-1 - n, i];
    case 2: return [b.subarray(i, i + n), i + n];
    case 3: return [b.subarray(i, i + n).toString("utf8"), i + n];
    case 4: {
      const out = [];
      for (let k = 0; k < n; k++) { let v; [v, i] = item(b, i); out.push(v); }
      return [out, i];
    }
    case 5: {
      const out = new Map();
      for (let k = 0; k < n; k++) { let key, v; [key, i] = item(b, i); [v, i] = item(b, i); out.set(key, v); }
      return [out, i];
    }
    case 6: return item(b, i);          // tag (COSE_Sign1 = 18): devolve o conteúdo
    default: throw new Error(`cbor: major ${major}`);
  }
}

/** Codificador só para o Sig_structure do COSE: ["Signature1", bstr, bstr, bstr]. */
export function encodeSigStructure(protectedBytes, payload) {
  const head = (major, len) => {
    if (len < 24) return Buffer.from([(major << 5) | len]);
    if (len < 256) return Buffer.from([(major << 5) | 24, len]);
    if (len < 65536) { const h = Buffer.alloc(3); h[0] = (major << 5) | 25; h.writeUInt16BE(len, 1); return h; }
    const h = Buffer.alloc(5); h[0] = (major << 5) | 26; h.writeUInt32BE(len, 1); return h;
  };
  const bstr = (x) => Buffer.concat([head(2, x.length), x]);
  const ctx = Buffer.from("Signature1");
  return Buffer.concat([head(4, 4), head(3, ctx.length), ctx, bstr(protectedBytes), bstr(Buffer.alloc(0)), bstr(payload)]);
}
