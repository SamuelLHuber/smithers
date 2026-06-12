#!/usr/bin/env bun
import { execSync, spawnSync } from "child_process";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "fs";

const STATE_FILE = ".sandbox-vm";
const ZONE = "us-central1-a";
const MACHINE_TYPE = "e2-small";

const cmd = process.argv[2];

function vmName(): string {
  const ts = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  return `sandbox-${ts}`;
}

if (cmd === "up") {
  const name = vmName();
  console.log(`Creating ${name} (${MACHINE_TYPE}) in ${ZONE}...`);
  execSync(
    `gcloud compute instances create ${name}` +
      ` --machine-type=${MACHINE_TYPE}` +
      ` --image-family=debian-12` +
      ` --image-project=debian-cloud` +
      ` --zone=${ZONE}`,
    { stdio: "inherit" },
  );
  writeFileSync(STATE_FILE, JSON.stringify({ name, zone: ZONE }));
  console.log(`\nConnecting to ${name}...`);
  spawnSync("gcloud", ["compute", "ssh", name, `--zone=${ZONE}`, "--ssh-flag=-A"], { stdio: "inherit" });
  console.log(`\nSession ended. Run 'pnpm sandbox:down' to delete the VM.`);
} else if (cmd === "down") {
  if (!existsSync(STATE_FILE)) {
    console.error("No sandbox VM found. Nothing to delete.");
    process.exit(1);
  }
  const { name, zone } = JSON.parse(readFileSync(STATE_FILE, "utf8"));
  console.log(`Deleting ${name}...`);
  execSync(`gcloud compute instances delete ${name} --zone=${zone} --quiet`, { stdio: "inherit" });
  unlinkSync(STATE_FILE);
  console.log("Deleted.");
} else {
  console.error("Usage: pnpm sandbox:[up|down]");
  process.exit(1);
}
