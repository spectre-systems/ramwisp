"""CBOR mínimo (RFC 8949): o suficiente para falar com o /dev/nsm e montar documentos de atestação de teste."""
import struct


def _head(major, n):
    if n < 24:
        return bytes([major << 5 | n])
    for ai, fmt in ((24, ">B"), (25, ">H"), (26, ">I"), (27, ">Q")):
        if n < 1 << (8 * struct.calcsize(fmt)):
            return bytes([major << 5 | ai]) + struct.pack(fmt, n)
    raise ValueError("inteiro grande demais")


def dumps(v):
    if v is None:
        return b"\xf6"
    if v is True:
        return b"\xf5"
    if v is False:
        return b"\xf4"
    if isinstance(v, int):
        return _head(0, v) if v >= 0 else _head(1, -1 - v)
    if isinstance(v, (bytes, bytearray)):
        return _head(2, len(v)) + bytes(v)
    if isinstance(v, str):
        b = v.encode()
        return _head(3, len(b)) + b
    if isinstance(v, (list, tuple)):
        return _head(4, len(v)) + b"".join(dumps(x) for x in v)
    if isinstance(v, dict):
        return _head(5, len(v)) + b"".join(dumps(k) + dumps(x) for k, x in v.items())
    raise TypeError(type(v))


def loads(b):
    v, i = _load(memoryview(bytes(b)), 0)
    return v


def _load(b, i):
    ib = b[i]; i += 1
    major, ai = ib >> 5, ib & 31
    if major == 7:
        if ai == 20: return False, i
        if ai == 21: return True, i
        if ai in (22, 23): return None, i
        if ai == 25: return _half(b[i:i + 2]), i + 2
        if ai == 26: return struct.unpack(">f", b[i:i + 4])[0], i + 4
        if ai == 27: return struct.unpack(">d", b[i:i + 8])[0], i + 8
        raise ValueError(f"simple {ai}")
    if ai < 24:
        n = ai
    elif ai in (24, 25, 26, 27):
        size = 1 << (ai - 24)
        n = int.from_bytes(b[i:i + size], "big"); i += size
    else:
        raise ValueError("comprimento indefinido não suportado")
    if major == 0: return n, i
    if major == 1: return -1 - n, i
    if major == 2: return bytes(b[i:i + n]), i + n
    if major == 3: return bytes(b[i:i + n]).decode(), i + n
    if major == 4:
        out = []
        for _ in range(n):
            x, i = _load(b, i); out.append(x)
        return out, i
    if major == 5:
        out = {}
        for _ in range(n):
            k, i = _load(b, i); x, i = _load(b, i); out[k] = x
        return out, i
    if major == 6:                       # tag: devolve só o conteúdo (COSE_Sign1 = tag 18)
        return _load(b, i)
    raise ValueError(f"major {major}")


def _half(h):
    return struct.unpack(">e", bytes(h))[0]
