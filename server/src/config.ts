const env = process.env;
const num = (v: string | undefined, d: number) => (v === undefined || v === "" ? d : Number(v));

export const config = {
  port: num(env.PORT, 4800),
  publicUrl: (env.PUBLIC_URL ?? "http://127.0.0.1:4800").replace(/\/$/, ""),
  dbPath: env.DB_PATH ?? new URL("../data/wisp.db", import.meta.url).pathname,
  /** "ec2" sobe EC2 com Nitro Enclave; "local" roda parent.py --dev aqui (enclave = container sem rede). */
  launcher: (env.LAUNCHER ?? "local") as "ec2" | "local",
  region: env.AWS_REGION ?? "us-east-1",
  artifactBucket: env.ARTIFACT_BUCKET ?? "",
  eifKey: env.EIF_KEY ?? "enclave/current.eif",
  instanceProfile: env.INSTANCE_PROFILE ?? "wisp-parent",
  securityGroupId: env.SECURITY_GROUP_ID ?? "",
  subnetIds: (env.SUBNET_IDS ?? "").split(",").filter(Boolean),
  /** API que a EC2 alcança (a pública; em dev, localhost). */
  agentApiUrl: (env.AGENT_API_URL ?? env.PUBLIC_URL ?? "http://127.0.0.1:4800").replace(/\/$/, ""),
  /** Teto de vCPU da conta (cota "Running On-Demand Standard") e de máquinas simultâneas. */
  maxVcpus: num(env.MAX_VCPUS, 5),
  maxInstances: num(env.MAX_INSTANCES, 1),
  signupCreditCents: num(env.SIGNUP_CREDIT_CENTS, 300),
  /** Total de crédito grátis que pode ser distribuído (sai dos US$ 100 da conta AWS). */
  freePoolCents: num(env.FREE_POOL_CENTS, 6000),
  /** Quanto da RAM da enclave vai para o sistema de arquivos em RAM da própria imagem. */
  enclaveOverheadMib: num(env.ENCLAVE_OVERHEAD_MIB, 3072),
  secureCookies: (env.PUBLIC_URL ?? "").startsWith("https://"),
  devImage: env.DEV_IMAGE ?? "wisp-enclave:dev",
};

/**
 * Máquinas com Nitro Enclaves (x86, us-east-1, on-demand, US$/h aproximado; conferir na tabela da AWS).
 * A hospedeira fica com 2 vCPU e ~2,5 GB; o resto vai para a enclave.
 */
export const INSTANCE_TYPES = [
  { type: "m7i.xlarge", vcpus: 4, memMib: 16384, usdHour: 0.2016 },
  { type: "r7i.xlarge", vcpus: 4, memMib: 32768, usdHour: 0.2646 },
  { type: "r7i.2xlarge", vcpus: 8, memMib: 65536, usdHour: 0.5292 },
];
export const PARENT_RESERVE_MIB = 2560;
export const RAM_TIERS = [2, 4, 8, 16, 24, 48];

export function pickInstance(ramGb: number) {
  const enclaveMem = ramGb * 1024 + config.enclaveOverheadMib;
  for (const t of INSTANCE_TYPES) {
    if (t.vcpus > config.maxVcpus) continue;
    if (t.memMib - PARENT_RESERVE_MIB >= enclaveMem) {
      return { ...t, enclaveMem, enclaveCpus: t.vcpus - 2, rateCentsHour: t.usdHour * 100 };
    }
  }
  return null;
}
