import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import type {
  DeterministicCheck,
  EditedContent,
  MediaAssets,
  Probe,
  ReleaseAnalysis,
  ReleaseContentInput,
  ScoreReport,
  TemplateSelection,
} from "./schemas";

const DEFAULT_ARTIFACT_DIR = ".smithers/executions/release-content";

export function safeJoin(root: string, repoRelativePath: string): string {
  const abs = resolve(root, repoRelativePath);
  const normalizedRoot = root.endsWith(sep) ? root : `${root}${sep}`;
  if (abs !== root && !abs.startsWith(normalizedRoot)) {
    throw new Error(`Refusing to write outside repository root: ${repoRelativePath}`);
  }
  return abs;
}

export function writeText(
  root: string,
  repoRelativePath: string,
  text: string,
  overwrite = true,
): string {
  const abs = safeJoin(root, repoRelativePath);
  if (!overwrite && existsSync(abs)) {
    throw new Error(`Refusing to overwrite existing file: ${repoRelativePath}`);
  }
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, text.endsWith("\n") ? text : `${text}\n`, "utf8");
  return repoRelativePath;
}

export function writeJson(
  root: string,
  repoRelativePath: string,
  data: unknown,
  overwrite = true,
): string {
  return writeText(root, repoRelativePath, JSON.stringify(data, null, 2), overwrite);
}

function artifactRunDir(input: ReleaseContentInput, probe: Probe): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return join(input.output.artifactDir, probe.version, stamp);
}

function renderThreadMarkdown(
  content: EditedContent,
  version: string,
  media?: MediaAssets | null,
): string {
  const thread = content.tweetThread;
  if (!thread) return "";
  const assetByIndex = new Map((media?.assets ?? []).map((asset) => [asset.tweetIndex, asset]));
  const lines = [
    `# Smithers ${version} launch thread`,
    "",
    thread.notes || "Ready-to-post X/Twitter thread generated from the release-content workflow.",
    "",
    "---",
    "",
  ];
  for (const tweet of thread.tweets) {
    lines.push(`### ${tweet.index}. Tweet ${tweet.index}`);
    const asset = assetByIndex.get(tweet.index);
    if (asset) {
      const label = tweet.mediaSuggestion || `${asset.kind} card`;
      lines.push(`**Media:** [${label} → ${asset.sibling}](${asset.sibling})`);
      if (asset.captureRecommended) {
        lines.push(
          `> Generated placeholder card. For the polished tweet, replace with a real terminal capture` +
            (asset.command ? ` of \`${asset.command}\`.` : "."),
        );
      }
    } else if (tweet.mediaSuggestion) {
      lines.push(`**Media:** ${tweet.mediaSuggestion}`);
    }
    lines.push("");
    lines.push(
      ...tweet.text
        .split("\n")
        .map((line) => (line.trim() ? `> ${line}` : ">")),
    );
    lines.push("");
    lines.push(`Claim IDs: ${tweet.claimIds.length ? tweet.claimIds.join(", ") : "none"}`);
    lines.push(`Characters: ${[...tweet.text].length}`);
    lines.push("");
    lines.push("---");
    lines.push("");
  }
  if (media?.generated && media.assets.length > 0) {
    lines.push("## Media manifest");
    lines.push("");
    lines.push("| Tweet | Asset | Kind |");
    lines.push("|-------|-------|------|");
    for (const asset of media.assets) {
      lines.push(`| ${asset.tweetIndex} | \`${asset.sibling}\` | ${asset.kind} |`);
    }
    lines.push("");
    if (media.rasterizerPath) {
      lines.push(
        `**Rasterize to PNG for upload:** \`node ${media.rasterizerPath}\` (renders each card at 2x).`,
      );
      lines.push("");
    }
    if (media.captures.length > 0) {
      lines.push("**Terminal captures still recommended:**");
      lines.push("");
      for (const capture of media.captures) {
        lines.push(`- Tweet ${capture.tweetIndex}: capture a real terminal of \`${capture.command}\``);
      }
      lines.push("");
    }
  }
  return lines.join("\n");
}

function renderPublishPlan(params: {
  input: ReleaseContentInput;
  probe: Probe;
  approved: boolean;
  score: ScoreReport | null | undefined;
  check: DeterministicCheck | null | undefined;
  content: EditedContent;
}) {
  const { input, probe, approved, score, check, content } = params;
  const wouldWrite: string[] = [];
  if (content.changelog && !input.skip.publishChangelog) wouldWrite.push(probe.changelogPath);
  if (content.blogPost && !input.skip.publishBlog) wouldWrite.push(probe.blogPath);
  if (content.tweetThread && !input.skip.publishThreadFile) wouldWrite.push(probe.threadPath);
  const blockedBecause: string[] = [];
  if (input.dryRun) blockedBecause.push("dryRun=true");
  if (!input.publish) blockedBecause.push("publish=false");
  if (input.quality.requireApprovalBeforePublish && !approved) blockedBecause.push("approval missing");
  if (check && !check.passed) blockedBecause.push("deterministic checks failed");
  if (score && !score.passed) blockedBecause.push("score report failed");

  return {
    dryRun: input.dryRun,
    publishRequested: input.publish,
    approved,
    templateReady: true,
    score: score?.score ?? null,
    deterministicPassed: check?.passed ?? null,
    wouldWrite,
    wouldPostToX: Boolean(content.tweetThread && !input.skip.publishX),
    tweetCount: content.tweetThread?.tweets.length ?? 0,
    blockedBecause,
  };
}

export function writePreviewArtifacts(params: {
  input: ReleaseContentInput;
  probe: Probe;
  analysis: ReleaseAnalysis;
  selected: TemplateSelection;
  content: EditedContent;
  check: DeterministicCheck | null | undefined;
  score: ScoreReport | null | undefined;
  media?: MediaAssets | null;
}) {
  const { input, probe, analysis, selected, content, check, score, media } = params;
  const root = process.cwd();
  const dir = artifactRunDir(input, probe);
  const files: string[] = [];
  const approved = false;
  const publishPlan = renderPublishPlan({ input, probe, approved, score, check, content });

  if (!input.output.writePreviewFiles) {
    return {
      artifactDir: dir,
      files,
      previewUrl: null,
      publishPlanPath: "",
      latestPointerPath: "",
    };
  }

  files.push(writeJson(root, join(dir, "release-analysis.json"), analysis));
  files.push(writeJson(root, join(dir, "template-selection.json"), selected));
  files.push(writeJson(root, join(dir, "deterministic-check.json"), check ?? null));
  files.push(writeJson(root, join(dir, "score-report.json"), score ?? null));
  files.push(writeJson(root, join(dir, "publish-plan.json"), publishPlan));

  if (content.changelog) files.push(writeText(root, join(dir, "changelog.preview.mdx"), content.changelog.markdown));
  if (content.tweetThread) files.push(writeText(root, join(dir, "tweet-thread.preview.md"), renderThreadMarkdown(content, probe.version, media)));
  if (media) files.push(writeJson(root, join(dir, "media-assets.json"), media));
  if (content.blogPost) files.push(writeText(root, join(dir, "blog-post.preview.mdx"), content.blogPost.markdown));
  files.push(writeJson(root, join(dir, "edited-content.json"), content));

  const latestPointerPath = join(input.output.artifactDir, `latest-${probe.version}.json`);
  const publishPlanPath = join(dir, "publish-plan.json");
  files.push(
    writeJson(root, latestPointerPath, {
      version: probe.version,
      artifactDir: dir,
      publishPlanPath,
      files,
      updatedAt: new Date().toISOString(),
    }),
  );

  return {
    artifactDir: dir,
    files,
    previewUrl: null,
    publishPlanPath,
    latestPointerPath,
  };
}

export function recordApprovalArtifact(params: {
  input: ReleaseContentInput;
  probe: Probe;
  approved: boolean;
  note?: string | null;
  artifacts?: { artifactDir?: string; publishPlanPath?: string } | null;
  score?: ScoreReport | null;
  check?: DeterministicCheck | null;
}) {
  const { input, probe, approved, note, artifacts, score, check } = params;
  const root = process.cwd();
  const reviewedPath = join(input.output.artifactDir, `reviewed-${probe.version}.json`);
  const reviewed = {
    version: probe.version,
    approved,
    note: note ?? null,
    artifactDir: artifacts?.artifactDir ?? null,
    publishPlanPath: artifacts?.publishPlanPath ?? null,
    score: score?.score ?? null,
    deterministicPassed: check?.passed ?? null,
    reviewedAt: new Date().toISOString(),
  };
  writeJson(root, reviewedPath, reviewed);

  if (!approved) {
    return {
      approved: false,
      markerPath: null,
      reviewedPath,
      message: "Release content was reviewed but not approved.",
    };
  }

  const markerPath = join(input.output.artifactDir, `approved-${probe.version}.json`);
  writeJson(root, markerPath, reviewed);
  return {
    approved: true,
    markerPath,
    reviewedPath,
    message: `Release content approved for ${probe.version}.`,
  };
}

export function publishFiles(params: {
  input: ReleaseContentInput;
  probe: Probe;
  content: EditedContent;
  media?: MediaAssets | null;
}) {
  const { input, probe, content, media } = params;
  const root = process.cwd();
  if (input.dryRun) {
    return {
      published: false,
      dryRun: true,
      files: [],
      tweetIds: [],
      message: "Dry run enabled; final files were not written.",
    };
  }
  const files: string[] = [];
  if (content.changelog && !input.skip.publishChangelog) {
    files.push(writeText(root, probe.changelogPath, content.changelog.markdown, input.output.overwrite));
  }
  if (content.blogPost && !input.skip.publishBlog) {
    files.push(writeText(root, probe.blogPath, content.blogPost.markdown, input.output.overwrite));
  }
  if (content.tweetThread && !input.skip.publishThreadFile) {
    files.push(writeText(root, probe.threadPath, renderThreadMarkdown(content, probe.version, media), input.output.overwrite));
  }
  return {
    published: files.length > 0,
    dryRun: false,
    files,
    tweetIds: [],
    message: files.length > 0 ? `Wrote ${files.length} release content file(s).` : "No file publish actions selected.",
  };
}

export function hasApprovedMarketingContent(version: string, artifactDir: unknown = DEFAULT_ARTIFACT_DIR): {
  ok: boolean;
  markerPath: string;
  message: string;
} {
  const root = process.cwd();
  const baseDir = typeof artifactDir === "string" && artifactDir.trim()
    ? artifactDir
    : DEFAULT_ARTIFACT_DIR;
  const markerPath = join(baseDir, `approved-${version}.json`);
  const abs = safeJoin(root, markerPath);
  if (!existsSync(abs)) {
    return {
      ok: false,
      markerPath,
      message: `Missing approved release-content marker at ${markerPath}.`,
    };
  }
  try {
    const marker = JSON.parse(readFileSync(abs, "utf8")) as { approved?: boolean };
    if (marker.approved !== true) {
      return { ok: false, markerPath, message: `Marker at ${markerPath} is not approved.` };
    }
  } catch (error) {
    return { ok: false, markerPath, message: `Could not parse ${markerPath}: ${String(error)}` };
  }
  return { ok: true, markerPath, message: `Approved release-content marker found at ${relative(root, abs)}.` };
}
