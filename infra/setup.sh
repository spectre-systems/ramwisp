#!/usr/bin/env bash
# Cria (idempotente) o mínimo na AWS: bucket de artefatos, roles da hospedeira e do builder, security group.
# Uso: AWS_PROFILE=wisp infra/setup.sh   → imprime as variáveis para server/.env
set -euo pipefail
REGION=${AWS_REGION:-$(aws configure get region)}
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
BUCKET=wisp-saas-artifacts-$ACCOUNT
TAGS='Key=project,Value=wisp-saas'
log() { echo "» $*" >&2; }

if ! aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
  log "bucket $BUCKET"
  if [ "$REGION" = us-east-1 ]; then aws s3api create-bucket --bucket "$BUCKET" >/dev/null
  else aws s3api create-bucket --bucket "$BUCKET" --create-bucket-configuration LocationConstraint="$REGION" >/dev/null; fi
  aws s3api put-public-access-block --bucket "$BUCKET" --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
  aws s3api put-bucket-tagging --bucket "$BUCKET" --tagging "TagSet=[{$TAGS}]"
fi

TRUST='{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ec2.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
role() {  # nome, política inline
  local name=$1 policy=$2
  if ! aws iam get-role --role-name "$name" >/dev/null 2>&1; then
    log "role $name"
    aws iam create-role --role-name "$name" --assume-role-policy-document "$TRUST" --tags "$TAGS" >/dev/null
  fi
  aws iam put-role-policy --role-name "$name" --policy-name "$name" --policy-document "$policy"
  if ! aws iam get-instance-profile --instance-profile-name "$name" >/dev/null 2>&1; then
    aws iam create-instance-profile --instance-profile-name "$name" --tags "$TAGS" >/dev/null
    aws iam add-role-to-instance-profile --instance-profile-name "$name" --role-name "$name"
  fi
}
# hospedeira: só lê a imagem da enclave e o parent.py. Não vê nada de cliente (nem precisa).
role wisp-parent "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":\"s3:GetObject\",
  \"Resource\":[\"arn:aws:s3:::$BUCKET/enclave/*\",\"arn:aws:s3:::$BUCKET/parent/*\"]}]}"
role wisp-builder "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":[\"s3:GetObject\",\"s3:PutObject\"],
  \"Resource\":[\"arn:aws:s3:::$BUCKET/*\"]}]}"

VPC=$(aws ec2 describe-vpcs --filters Name=is-default,Values=true --query 'Vpcs[0].VpcId' --output text)
if [ "$VPC" = None ]; then log "sem VPC padrão: criando"; VPC=$(aws ec2 create-default-vpc --query Vpc.VpcId --output text); fi
SG=$(aws ec2 describe-security-groups --filters Name=group-name,Values=wisp-parent Name=vpc-id,Values="$VPC" \
  --query 'SecurityGroups[0].GroupId' --output text)
if [ "$SG" = None ]; then
  log "security group wisp-parent (sem entrada; saída liberada)"
  SG=$(aws ec2 create-security-group --group-name wisp-parent --description "wisp: hospedeira sem portas de entrada" \
    --vpc-id "$VPC" --tag-specifications "ResourceType=security-group,Tags=[{$TAGS}]" --query GroupId --output text)
fi
# sub-redes padrão em zonas que oferecem as máquinas com enclave
AZS=$(aws ec2 describe-instance-type-offerings --location-type availability-zone \
  --filters Name=instance-type,Values=m7i.xlarge --query 'InstanceTypeOfferings[].Location' --output text)
SUBNETS=$(aws ec2 describe-subnets --filters Name=vpc-id,Values="$VPC" Name=default-for-az,Values=true \
  --query 'Subnets[].[SubnetId,AvailabilityZone]' --output text | awk -v azs="$AZS" 'index(azs,$2){print $1}' | paste -sd, -)

cat <<EOF
AWS_REGION=$REGION
ARTIFACT_BUCKET=$BUCKET
INSTANCE_PROFILE=wisp-parent
SECURITY_GROUP_ID=$SG
SUBNET_IDS=$SUBNETS
EOF
