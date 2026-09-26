import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DescribeInstancesCommand, EC2Client, RunInstancesCommand, TerminateInstancesCommand,
} from "@aws-sdk/client-ec2";
import { config } from "./config.ts";

export type LaunchSpec = {
  jobId: string; jobToken: string; instanceType: string; memMib: number; cpus: number; deadlineMin: number;
};

const ec2 = new EC2Client({ region: config.region });
const PARENT_KEY = "parent/parent.py";
const localProcs = new Map<string, ReturnType<typeof spawn>>();

function userData(s: LaunchSpec) {
  const job = { api: config.agentApiUrl, job_id: s.jobId, job_token: s.jobToken, mem_mib: s.memMib, cpus: s.cpus,
    eif_path: "/opt/wisp/enclave.eif" };
  const bucket = config.artifactBucket;
  // Hospedeira não confiável: nada aqui é segredo do cliente (o token do job só fala com /agent/* deste job).
  return `#!/bin/bash
set -uo pipefail
shutdown -h +${s.deadlineMin}
exec >/var/log/wisp-boot.log 2>&1
API=${JSON.stringify(config.agentApiUrl)}
AUTH="Authorization: Bearer ${s.jobToken}"
st() { curl -fsS -m 10 -X POST -H "$AUTH" -H 'Content-Type: application/json' -d "{\\"phase\\":\\"$1\\"}" "$API/agent/status" || true; }
st booting
mkdir -p /etc/wisp /opt/wisp
cat > /etc/wisp/job.json <<'EOF'
${JSON.stringify(job)}
EOF
chmod 600 /etc/wisp/job.json
if ! command -v nitro-cli >/dev/null; then dnf install -y -q aws-nitro-enclaves-cli || { st failed; shutdown -h now; }; fi
st fetching_image
aws s3 cp --only-show-errors s3://${bucket}/${PARENT_KEY} /opt/wisp/parent.py
[ -f /opt/wisp/enclave.eif ] || aws s3 cp --only-show-errors s3://${bucket}/${config.eifKey} /opt/wisp/enclave.eif
python3 /opt/wisp/parent.py /etc/wisp/job.json
shutdown -h now
`;
}

export async function launch(s: LaunchSpec): Promise<string> {
  if (config.launcher === "local") return launchLocal(s);
  const subnet = config.subnetIds.length ? config.subnetIds[Math.floor(Math.random() * config.subnetIds.length)] : undefined;
  const tags = [{ Key: "project", Value: "wisp-saas" }, { Key: "wisp-job", Value: s.jobId }, { Key: "Name", Value: `wisp ${s.jobId}` }];
  const r = await ec2.send(new RunInstancesCommand({
    ImageId: "resolve:ssm:/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64",
    InstanceType: s.instanceType as never,
    MinCount: 1, MaxCount: 1,
    EnclaveOptions: { Enabled: true },
    IamInstanceProfile: { Name: config.instanceProfile },
    InstanceInitiatedShutdownBehavior: "terminate",
    MetadataOptions: { HttpTokens: "required", HttpPutResponseHopLimit: 1, HttpEndpoint: "enabled" },
    BlockDeviceMappings: [{ DeviceName: "/dev/xvda", Ebs: { VolumeSize: 16, VolumeType: "gp3", DeleteOnTermination: true, Encrypted: true } }],
    NetworkInterfaces: [{ DeviceIndex: 0, AssociatePublicIpAddress: true, Groups: [config.securityGroupId], SubnetId: subnet }],
    UserData: Buffer.from(userData(s)).toString("base64"),
    TagSpecifications: [{ ResourceType: "instance", Tags: tags }, { ResourceType: "volume", Tags: tags }],
  }));
  return r.Instances![0].InstanceId!;
}

function launchLocal(s: LaunchSpec): string {
  const dir = mkdtempSync(join(tmpdir(), "wisp-job-"));
  const cfgPath = join(dir, "job.json");
  writeFileSync(cfgPath, JSON.stringify({ api: config.agentApiUrl, job_id: s.jobId, job_token: s.jobToken,
    mem_mib: s.memMib, cpus: Math.max(1, Math.min(2, s.cpus)), dev_image: config.devImage }), { mode: 0o600 });
  const parent = new URL("../../parent/parent.py", import.meta.url).pathname;
  const p = spawn("python3", [parent, cfgPath, "--dev"], { stdio: ["ignore", "inherit", "inherit"] });
  const id = `local-${s.jobId}`;
  localProcs.set(id, p);
  p.on("exit", () => localProcs.delete(id));
  return id;
}

export async function terminate(instanceId: string) {
  if (instanceId.startsWith("local-")) {
    localProcs.get(instanceId)?.kill("SIGTERM");
    spawn("docker", ["rm", "-f", `wisp-enc-${instanceId.slice(6)}`], { stdio: "ignore" });
    return;
  }
  await ec2.send(new TerminateInstancesCommand({ InstanceIds: [instanceId] }));
}

/** Instâncias do projeto que ainda estão de pé (para o faxineiro achar órfãs). */
export async function liveInstances(): Promise<{ id: string; jobId?: string; launchedAt?: Date }[]> {
  if (config.launcher === "local") {
    return [...localProcs.keys()].map((id) => ({ id, jobId: id.slice(6) }));
  }
  const out: { id: string; jobId?: string; launchedAt?: Date }[] = [];
  let token: string | undefined;
  do {
    const r = await ec2.send(new DescribeInstancesCommand({
      Filters: [{ Name: "tag:project", Values: ["wisp-saas"] },
        { Name: "instance-state-name", Values: ["pending", "running", "stopping", "stopped"] }],
      NextToken: token,
    }));
    for (const res of r.Reservations ?? []) for (const i of res.Instances ?? []) {
      out.push({ id: i.InstanceId!, jobId: i.Tags?.find((t) => t.Key === "wisp-job")?.Value, launchedAt: i.LaunchTime });
    }
    token = r.NextToken;
  } while (token);
  return out;
}
