#!/usr/bin/env bash
# Monta a imagem da enclave (EIF) numa EC2 descartável e publica EIF + PCRs no bucket.
# O PCR0 impresso no fim vai para mcp/pcrs.json: é o que os clientes aceitam.
# Uso: AWS_PROFILE=wisp ARTIFACT_BUCKET=... infra/build-eif.sh
set -euo pipefail
cd "$(dirname "$0")/.."
: "${ARTIFACT_BUCKET:?defina ARTIFACT_BUCKET}"
REV=$(git rev-parse --short HEAD)$(git diff --quiet -- enclave || echo -dirty)
SRC=enclave-src-$REV.tgz
log() { echo "» $*" >&2; }

tar czf "/tmp/$SRC" -C enclave .
aws s3 cp --only-show-errors "/tmp/$SRC" "s3://$ARTIFACT_BUCKET/build/$SRC"
aws s3 cp --only-show-errors parent/parent.py "s3://$ARTIFACT_BUCKET/parent/parent.py"

USERDATA=$(cat <<EOF
#!/bin/bash
set -euxo pipefail
exec >/var/log/wisp-build.log 2>&1
shutdown -h +60
trap 'aws s3 cp /var/log/wisp-build.log s3://$ARTIFACT_BUCKET/build/$REV.log || true; shutdown -h now' EXIT
dnf install -y -q docker aws-nitro-enclaves-cli aws-nitro-enclaves-cli-devel
systemctl start docker
mkdir -p /build && cd /build
aws s3 cp s3://$ARTIFACT_BUCKET/build/$SRC . && tar xzf $SRC
docker build -t wisp-enclave:$REV .
nitro-cli build-enclave --docker-uri wisp-enclave:$REV --output-file enclave.eif > pcrs.json
aws s3 cp enclave.eif s3://$ARTIFACT_BUCKET/enclave/$REV.eif
aws s3 cp pcrs.json s3://$ARTIFACT_BUCKET/enclave/$REV.pcrs.json
aws s3 cp enclave.eif s3://$ARTIFACT_BUCKET/enclave/current.eif
EOF
)
SUBNET=$(aws ec2 describe-subnets --filters Name=default-for-az,Values=true --query 'Subnets[0].SubnetId' --output text)
ID=$(aws ec2 run-instances --image-id resolve:ssm:/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64 \
  --instance-type m7i.large --iam-instance-profile Name=wisp-builder --instance-initiated-shutdown-behavior terminate \
  --metadata-options HttpTokens=required,HttpPutResponseHopLimit=2 --subnet-id "$SUBNET" \
  --block-device-mappings 'DeviceName=/dev/xvda,Ebs={VolumeSize=30,VolumeType=gp3,DeleteOnTermination=true,Encrypted=true}' \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=project,Value=wisp-saas},{Key=Name,Value=wisp-eif-builder}]' \
  --user-data "$USERDATA" --query 'Instances[0].InstanceId' --output text)
log "builder $ID subindo (rev $REV); esperando o PCR0 (~6-10 min)…"
for _ in $(seq 1 90); do
  if aws s3 cp --only-show-errors "s3://$ARTIFACT_BUCKET/enclave/$REV.pcrs.json" /tmp/pcrs-$REV.json 2>/dev/null; then
    cat /tmp/pcrs-$REV.json
    PCR0=$(python3 -c "import json;print(json.load(open('/tmp/pcrs-$REV.json'))['Measurements']['PCR0'])")
    python3 - "$PCR0" "$REV" <<'PY'
import json, sys
p = "mcp/pcrs.json"; d = json.load(open(p)); pcr0, rev = sys.argv[1], sys.argv[2]
d.setdefault("pcr0", []); d.setdefault("builds", {})
if pcr0 not in d["pcr0"]: d["pcr0"].append(pcr0)
d["builds"][pcr0] = rev
json.dump(d, open(p, "w"), indent=2); print("mcp/pcrs.json atualizado")
PY
    exit 0
  fi
  STATE=$(aws ec2 describe-instances --instance-ids "$ID" --query 'Reservations[0].Instances[0].State.Name' --output text)
  [ "$STATE" = terminated ] && { log "builder terminou sem publicar PCRs"; aws s3 cp "s3://$ARTIFACT_BUCKET/build/$REV.log" - 2>/dev/null | tail -30; exit 1; }
  sleep 10
done
log "tempo esgotado"; exit 1
