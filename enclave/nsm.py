"""Atestação da enclave.

Produção: fala direto com o driver /dev/nsm (ioctl), sem biblioteca externa.
Dev (WISP_DEV=1): gera um documento no MESMO formato (COSE_Sign1 ES384 + cadeia X.509), assinado por
uma raiz de desenvolvimento criada na hora. O cliente só aceita essa raiz se for apontado para ela
explicitamente; em produção ele confia só na raiz AWS Nitro Enclaves G1.
"""
import ctypes, fcntl, hashlib, os, time

import cbor

NSM_IOCTL = 0xC0200A00          # _IOWR(0x0A, 0, sizeof(struct nsm_message) = 2 iovecs = 32 bytes)
RESP_MAX = 0x3000


class _IoVec(ctypes.Structure):
    _fields_ = [("base", ctypes.c_void_p), ("len", ctypes.c_size_t)]


class _Msg(ctypes.Structure):
    _fields_ = [("request", _IoVec), ("response", _IoVec)]


def _nsm_call(request):
    req = cbor.dumps(request)
    req_buf = ctypes.create_string_buffer(req, len(req))
    resp_buf = ctypes.create_string_buffer(RESP_MAX)
    msg = _Msg(_IoVec(ctypes.cast(req_buf, ctypes.c_void_p), len(req)),
               _IoVec(ctypes.cast(resp_buf, ctypes.c_void_p), RESP_MAX))
    fd = os.open("/dev/nsm", os.O_RDWR)
    try:
        fcntl.ioctl(fd, NSM_IOCTL, msg)
    finally:
        os.close(fd)
    return cbor.loads(resp_buf.raw[:msg.response.len])


def attest(public_key: bytes, nonce: bytes, user_data: bytes) -> bytes:
    if os.environ.get("WISP_DEV") == "1":
        return _dev_attest(public_key, nonce, user_data)
    resp = _nsm_call({"Attestation": {"user_data": user_data, "nonce": nonce, "public_key": public_key}})
    if "Attestation" not in resp:
        raise RuntimeError(f"nsm: {resp}")
    return resp["Attestation"]["document"]


# ---------------------------------------------------------------- modo dev

def _dev_attest(public_key, nonce, user_data):
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature
    from cryptography.x509.oid import NameOID
    import datetime

    def cert(subject, issuer, pub, key, ca):
        now = datetime.datetime.now(datetime.timezone.utc)
        b = (x509.CertificateBuilder().subject_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, subject)]))
             .issuer_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, issuer)]))
             .public_key(pub).serial_number(x509.random_serial_number())
             .not_valid_before(now - datetime.timedelta(minutes=5)).not_valid_after(now + datetime.timedelta(days=1))
             .add_extension(x509.BasicConstraints(ca=ca, path_length=None), critical=True))
        return b.sign(key, hashes.SHA384())

    root_key = ec.generate_private_key(ec.SECP384R1())
    root = cert("wisp-dev-root", "wisp-dev-root", root_key.public_key(), root_key, True)
    leaf_key = ec.generate_private_key(ec.SECP384R1())
    leaf = cert("wisp-dev-enclave", "wisp-dev-root", leaf_key.public_key(), root_key, False)
    out = os.environ.get("WISP_DEV_ROOT_OUT")
    if out:
        with open(out, "wb") as f:
            f.write(root.public_bytes(serialization.Encoding.PEM))
    der = lambda c: c.public_bytes(serialization.Encoding.DER)
    pcrs = {i: bytes(48) for i in range(16)}
    pcrs[0] = hashlib.sha384(b"wisp-dev-image").digest()
    payload = cbor.dumps({
        "module_id": "wisp-dev", "digest": "SHA384", "timestamp": int(time.time() * 1000), "pcrs": pcrs,
        "certificate": der(leaf), "cabundle": [der(root)],
        "public_key": public_key, "user_data": user_data, "nonce": nonce})
    protected = cbor.dumps({1: -35})    # alg ES384
    sig_structure = cbor.dumps(["Signature1", protected, b"", payload])
    r, s = decode_dss_signature(leaf_key.sign(sig_structure, ec.ECDSA(hashes.SHA384())))
    return cbor.dumps([protected, {}, payload, r.to_bytes(48, "big") + s.to_bytes(48, "big")])
