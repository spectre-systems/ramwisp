# Imagem da enclave: a mesma base do wisp-agent + o runner. Vira EIF com `nitro-cli build-enclave`;
# o hash dessa imagem (PCR0) é o que o cliente confere antes de mandar a credencial.
# Versões fixas: mudar qualquer uma muda o PCR0 (e exige publicar o novo em mcp/pcrs.json).
FROM debian:bookworm-slim@sha256:3783cc01769c7b2b1b83a5c5ad96c815348e28ed7da68e2e3687004faa906251
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl git coreutils iproute2 python3 python3-cryptography procps \
 && rm -rf /var/lib/apt/lists/*
ARG CLAUDE_VERSION=2.1.283
RUN HOME=/opt/claude bash -c "curl -fsSL https://claude.ai/install.sh | bash -s ${CLAUDE_VERSION}" \
 && ln -s "$(readlink -f /opt/claude/.local/bin/claude)" /usr/local/bin/claude \
 && useradd -m -u 1000 agent
ARG CODEX_VERSION=0.157.0
RUN mkdir -p /opt/codex \
 && ARCH="$(uname -m | sed 's/arm64/aarch64/')" \
 && curl -fsSL "https://github.com/openai/codex/releases/download/rust-v${CODEX_VERSION}/codex-package-${ARCH}-unknown-linux-musl.tar.gz" \
    | tar -xz -C /opt/codex --exclude='codex-resources/voice' \
 && ln -s /opt/codex/bin/codex /usr/local/bin/codex \
 && codex --version
COPY cbor.py nsm.py sealed.py runner.py /opt/wisp/
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
CMD ["python3", "/opt/wisp/runner.py"]
