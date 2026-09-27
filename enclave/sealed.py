"""Canal selado cliente <-> enclave (wisp-v1).

X25519 efêmero dos dois lados; HKDF-SHA256 com salt = nonce do cliente; ChaCha20-Poly1305.
Chaves diferentes por direção, amarradas às duas chaves públicas. Mesma especificação em mcp/src/crypto.js.
"""
import base64, os

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey, X25519PublicKey
from cryptography.hazmat.primitives.ciphers.aead import ChaCha20Poly1305
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

VERSION = b"wisp-v1"
b64 = lambda b: base64.b64encode(b).decode()
unb64 = base64.b64decode


def raw_pub(priv):
    return priv.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)


def _key(priv, peer_pub, nonce, direction, enclave_pub, client_pub):
    shared = priv.exchange(X25519PublicKey.from_public_bytes(peer_pub))
    info = VERSION + b" " + direction + enclave_pub + client_pub
    return HKDF(hashes.SHA256(), 32, nonce, info).derive(shared)


class EnclaveSession:
    """Lado da enclave: gera o par na hora; a chave privada nunca sai da memória."""

    def __init__(self, nonce):
        self.nonce = nonce
        self.priv = X25519PrivateKey.generate()
        self.pub = raw_pub(self.priv)
        self.client_pub = None

    def open_input(self, msg):
        self.client_pub = unb64(msg["c_pub"])
        k = _key(self.priv, self.client_pub, self.nonce, b"in", self.pub, self.client_pub)
        return ChaCha20Poly1305(k).decrypt(unb64(msg["iv"]), unb64(msg["ct"]), VERSION + b" in")

    def seal_output(self, plaintext, aad=b" out"):
        k = _key(self.priv, self.client_pub, self.nonce, b"out", self.pub, self.client_pub)
        iv = os.urandom(12)
        return {"iv": b64(iv), "ct": b64(ChaCha20Poly1305(k).encrypt(iv, plaintext, VERSION + aad))}

    def seal_log(self, plaintext):
        """Trecho do log ao vivo: mesma chave de saída, AAD próprio (um trecho nunca passa por resultado e vice-versa)."""
        return self.seal_output(plaintext, b" log")


class ClientSession:
    """Lado do cliente (referência em Python; o MCP real usa mcp/src/crypto.js)."""

    def __init__(self, nonce, enclave_pub):
        self.nonce, self.enclave_pub = nonce, enclave_pub
        self.priv = X25519PrivateKey.generate()
        self.pub = raw_pub(self.priv)

    def seal_input(self, plaintext):
        k = _key(self.priv, self.enclave_pub, self.nonce, b"in", self.enclave_pub, self.pub)
        iv = os.urandom(12)
        return {"c_pub": b64(self.pub), "iv": b64(iv),
                "ct": b64(ChaCha20Poly1305(k).encrypt(iv, plaintext, VERSION + b" in"))}

    def open_output(self, msg, aad=b" out"):
        k = _key(self.priv, self.enclave_pub, self.nonce, b"out", self.enclave_pub, self.pub)
        return ChaCha20Poly1305(k).decrypt(unb64(msg["iv"]), unb64(msg["ct"]), VERSION + aad)
