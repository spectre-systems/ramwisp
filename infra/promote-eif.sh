#!/usr/bin/env bash
# Põe em produção a imagem <rev> montada pelo build-eif.sh (e a hospedeira da mesma revisão).
# Antes: o MCP publicado no npm tem que aceitar o PCR0 dela (mcp/pcrs.json), senão os clientes recusam as máquinas.
# Voltar atrás: promover a revisão anterior (a antiga continua no bucket e no pcrs.json).
# Uso: AWS_PROFILE=wisp ARTIFACT_BUCKET=... infra/promote-eif.sh <rev>
set -euo pipefail
cd "$(dirname "$0")/.."
: "${ARTIFACT_BUCKET:?defina ARTIFACT_BUCKET}"
REV=${1:?uso: promote-eif.sh <rev>}
PCR0=$(aws s3 cp --only-show-errors "s3://$ARTIFACT_BUCKET/enclave/$REV.pcrs.json" - | python3 -c "import json,sys;print(json.load(sys.stdin)['Measurements']['PCR0'])")
PUBLISHED=$(npm view ramwisp@latest version)
if ! curl -fsSL "https://unpkg.com/ramwisp@$PUBLISHED/pcrs.json" | grep -q "$PCR0"; then
  echo "ramwisp@$PUBLISHED (npm) ainda não aceita o PCR0 $PCR0 — publique o MCP primeiro" >&2; exit 1
fi
aws s3 cp --only-show-errors "s3://$ARTIFACT_BUCKET/enclave/$REV.eif" "s3://$ARTIFACT_BUCKET/enclave/current.eif"
if aws s3 ls "s3://$ARTIFACT_BUCKET/parent/$REV.py" >/dev/null; then
  aws s3 cp --only-show-errors "s3://$ARTIFACT_BUCKET/parent/$REV.py" "s3://$ARTIFACT_BUCKET/parent/parent.py"
fi
echo "em produção: enclave $REV (PCR0 ${PCR0:0:16}…), aceito por ramwisp@$PUBLISHED. Vale para as próximas máquinas."
