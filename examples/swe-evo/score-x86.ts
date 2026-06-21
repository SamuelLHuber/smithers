/**
 * Remote x86 scorer for SWE-EVO instances whose gold patch (and therefore any
 * candidate) does NOT reproduce under Docker emulation on Apple Silicon.
 *
 * The split is deliberate (see make-showcase.ts coverage notes):
 *   - candidate PATCHES are generated on the Mac, where the agent CLIs + auth
 *     live (gen-candidates.ts writes .data/candidates/<id>.patch)
 *   - SCORING runs here on a native x86 Linux + Docker VM (Freestyle), which has
 *     no agent CLIs and needs none — only Docker + python3 + the vendored harness
 *
 * That separation is the whole point: the part of Freestyle that was unreliable
 * before was installing agent CLIs. Pure Docker scoring avoids it entirely.
 *
 *   bun score-x86.ts --subset <file>            # score .data/candidates/<id>.patch for each id
 *   bun score-x86.ts <id>...                    # score specific ids' candidates
 *   bun score-x86.ts --gold <id>...             # use the gold patch as the candidate (x86 gold-verify)
 *   bun score-x86.ts --gold --subset <file>
 *
 * Writes/merges results into .data/x86-scores.json keyed by instance_id.
 * Respects Freestyle's 32 GB plan storage cap by pruning each image after use.
 */

import { freestyle } from "freestyle";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, ".data");
const INSTANCES_DIR = join(HERE, "dataset", "data", "instances");
const HARNESS = join(HERE, "harness");
const CANDIDATES = join(DATA, "candidates");
const OUT = join(DATA, "x86-scores.json");
const SCORE_TIMEOUT_S = Number(process.env.SWEEVO_SCORE_TIMEOUT_S ?? 1800);

type Args = { ids: string[]; gold: boolean };
function parseArgs(argv: string[]): Args {
  const a: Args = { ids: [], gold: false };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === "--gold") a.gold = true;
    else if (t === "--subset") {
      a.ids.push(
        ...readFileSync(argv[++i], "utf8")
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => l && !l.startsWith("#")),
      );
    } else a.ids.push(t);
  }
  if (a.ids.length === 0) throw new Error("Select: <id>..., or --subset <file>; add --gold to score the gold patch");
  return a;
}

const ts = () => new Date().toISOString().slice(11, 19);
const log = (...m: unknown[]) => console.log(ts(), ...m);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Every Freestyle SDK call can throw a transient INTERNAL_ERROR — retry all. */
async function retry<T>(label: string, fn: () => Promise<T>, n = 5): Promise<T> {
  let last: unknown;
  for (let i = 0; i < n; i++) {
    try {
      return await fn();
    } catch (e: unknown) {
      last = e;
      log(`  ${label} retry ${i + 1}/${n}: ${String((e as Error)?.message ?? e).slice(0, 90)}`);
      await sleep(2000 * (i + 1));
    }
  }
  throw last;
}

const ENV = "HOME=/root PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin";

/**
 * Write a (possibly large) file on the VM via chunked base64, then VERIFY the
 * decoded byte count matches and retry the whole upload on mismatch. Without the
 * verify, a flaky/truncated chunk leaves a stale or partial file — which silently
 * scored several instances against the WRONG instance's tests (the 2774/5778
 * contamination bug). base64's alphabet has no single quotes, so single-quoting
 * each chunk is safe.
 */
async function putFile(vm: any, remotePath: string, content: string): Promise<void> {
  const b64 = Buffer.from(content, "utf8").toString("base64");
  const expectedBytes = Buffer.byteLength(content, "utf8");
  const CHUNK = 30_000;
  for (let attempt = 0; attempt < 4; attempt++) {
    await retry(`mk ${remotePath}`, () => vm.exec(`${ENV} sh -c ': > ${remotePath}.b64'`));
    for (let i = 0; i < b64.length; i += CHUNK) {
      const part = b64.slice(i, i + CHUNK);
      await retry(`put ${remotePath} @${i}`, () =>
        vm.exec(`${ENV} sh -c "printf %s '${part}' >> ${remotePath}.b64"`),
      );
    }
    await retry(`decode ${remotePath}`, () =>
      vm.exec(`${ENV} sh -c 'base64 -d ${remotePath}.b64 > ${remotePath} && rm -f ${remotePath}.b64'`),
    );
    const chk = (await retry(`verify ${remotePath}`, () =>
      vm.exec(`${ENV} sh -c 'wc -c < ${remotePath}'`),
    ).catch(() => ({ stdout: "" }))) as any;
    const got = parseInt(String(chk.stdout ?? "").trim(), 10);
    if (got === expectedBytes) return;
    log(`  upload ${remotePath}: size ${got} != ${expectedBytes}, retry ${attempt + 1}/4`);
  }
  throw new Error(`putFile ${remotePath}: integrity check failed after retries`);
}

function loadResults(): Record<string, any> {
  if (existsSync(OUT)) {
    try {
      return JSON.parse(readFileSync(OUT, "utf8"));
    } catch {
      /* ignore */
    }
  }
  return {};
}

/**
 * Score one instance on its OWN fresh VM. Per-instance isolation is essential:
 * a single reused VM gets its 32GB rootfs exhausted by huge images (dask) and a
 * timeout leaves Docker wedged, which poisoned every later instance with bogus
 * 0/all results. A fresh VM per instance can't cross-contaminate.
 */
async function scoreOne(id: string, gold: boolean): Promise<any | null> {
  const instPath = join(INSTANCES_DIR, `${id}.json`);
  if (!existsSync(instPath)) return { instance_id: id, resolved: 0, scored_on: "x86", error: "no dataset entry" };
  const instance = JSON.parse(readFileSync(instPath, "utf8"));
  const candidate = gold
    ? (instance.patch ?? "")
    : (existsSync(join(CANDIDATES, `${id}.patch`)) ? readFileSync(join(CANDIDATES, `${id}.patch`), "utf8") : null);
  if (candidate === null) return null; // no candidate generated yet

  const { vm } = await retry(`create-vm ${id}`, () => freestyle.vms.create());
  const vmId = (vm as any).vmId ?? (vm as any).id;
  log(`  ${id}: VM ${vmId} (image ${instance.image})`);
  try {
    await retry("resize", () => vm.resize({ storage: 32 }), 2).catch(() => {});
    await retry("mkdir", () => vm.exec(`${ENV} mkdir -p /root/harness /root/work`));
    await putFile(vm, "/root/harness/score_instance.py", readFileSync(join(HARNESS, "score_instance.py"), "utf8"));
    await putFile(vm, "/root/harness/parsers.py", readFileSync(join(HARNESS, "parsers.py"), "utf8"));
    await putFile(vm, "/root/work/inst.json", JSON.stringify(instance));
    await putFile(vm, "/root/work/cand.patch", candidate);

    // vm.exec has a ~4-5 min ceiling, but an image pull + test run can run much
    // longer. Launch scoring detached, then poll a short exec for the done flag.
    await retry(`launch ${id}`, () =>
      vm.exec(
        `${ENV} sh -c 'rm -f /root/work/result.json /root/work/done; ` +
          `nohup sh -c "cd /root/harness && python3 score_instance.py ` +
          `--instance /root/work/inst.json --patch /root/work/cand.patch ` +
          `--out /root/work/result.json --timeout ${SCORE_TIMEOUT_S} --platform linux/amd64 ` +
          `> /root/work/score.log 2>&1; touch /root/work/done" >/dev/null 2>&1 & echo launched'`,
      ),
    );
    const start = Date.now();
    const deadline = start + (SCORE_TIMEOUT_S + 1200) * 1000; // + image-pull headroom
    let out = "";
    let polls = 0;
    while (Date.now() < deadline) {
      await sleep(15_000);
      const p = (await retry(`poll ${id}`, () =>
        vm.exec(
          `${ENV} sh -c 'if [ -f /root/work/done ]; then echo ---DONE---; cat /root/work/result.json 2>/dev/null; else tail -1 /root/work/score.log 2>/dev/null; fi'`,
        ),
      ).catch(() => ({ stdout: "" }))) as any;
      out = String(p.stdout ?? "");
      if (out.includes("---DONE---")) break;
      if (++polls % 4 === 0) log(`    ${id} … ${Math.round((Date.now() - start) / 1000)}s | ${out.trim().slice(-100) || "(no log yet)"}`);
    }
    const marker = out.indexOf("---DONE---");
    if (marker >= 0) {
      try {
        const parsed = JSON.parse(out.slice(marker + "---DONE---".length).trim());
        if (parsed && parsed.resolved != null) return parsed;
      } catch {
        /* fall through */
      }
    }
    const t = (await retry(`tail ${id}`, () => vm.exec(`${ENV} tail -5 /root/work/score.log 2>/dev/null`)).catch(() => ({ stdout: "" }))) as any;
    return { instance_id: id, resolved: 0, error: String(t.stdout ?? out).slice(-400) || "timeout, no result" };
  } finally {
    try {
      await (vm as any).destroy?.();
    } catch {
      /* ignore */
    }
    try {
      await (freestyle as any).vms.delete({ vmId });
    } catch {
      /* ignore */
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  log(`x86 scoring ${args.ids.length} instance(s)${args.gold ? " (GOLD patch = candidate)" : ""} — fresh VM per instance`);
  const results = loadResults();
  for (const id of args.ids) {
    log(`scoring ${id} ...`);
    const r = await scoreOne(id, args.gold).catch((e) => ({
      instance_id: id,
      resolved: 0,
      error: String((e as Error)?.message ?? e).slice(0, 400),
    }));
    if (r === null) {
      log(`  SKIP ${id}: no candidate at .data/candidates/${id}.patch`);
      continue;
    }
    results[id] = { ...r, scored_on: "x86", gold_verify: args.gold };
    mkdirSync(DATA, { recursive: true });
    writeFileSync(OUT, JSON.stringify(results, null, 2));
    if (results[id].error) log(`  ${id}: NO RESULT — ${String(results[id].error).slice(-150).replace(/\n/g, " ")}`);
    else log(`  ${id}: resolved=${r.resolved} fix=${r.fix_rate} F2P=${r.f2p_passed}/${r.f2p_total} P2P=${r.p2p_passed}/${r.p2p_total}`);
  }
  log(`done. results -> ${OUT}`);
}

main().catch((e) => {
  console.error("score-x86 failed:", String((e as Error)?.message ?? e));
  process.exit(1);
});
