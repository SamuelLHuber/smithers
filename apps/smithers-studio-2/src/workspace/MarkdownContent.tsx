import { Fragment, type ReactNode } from "react";

/**
 * Only render links whose scheme can't execute script. Agent/LLM output can
 * contain `[label](javascript:...)`, which React renders verbatim into href and
 * runs on click. Allow http(s), mailto, and relative/anchor links; everything
 * else falls back to plain text.
 */
function isSafeHref(href: string): boolean {
  const value = href.trim();
  if (value.startsWith("/") || value.startsWith("#") || value.startsWith("./") || value.startsWith("../")) {
    return true;
  }
  return /^(https?:|mailto:)/i.test(value);
}

/**
 * Dependency-free markdown renderer for chat blocks. The repo ships no markdown
 * library, and chat content is trusted agent output (not arbitrary HTML), so we
 * render a deliberately small, safe subset: fenced code blocks, inline code,
 * bold, italic, links, and paragraph/line breaks. Code is rendered verbatim in
 * a mono block (no HTML injection) — exactly the surface the gui POC
 * ChatBlockRenderer covers.
 */
export function MarkdownContent({ text }: { text: string }) {
  const segments = splitFences(text);
  return (
    <div className="ws-md">
      {segments.map((segment, index) =>
        segment.kind === "code" ? (
          <pre className="ws-md-code" data-lang={segment.lang || undefined} key={index}>
            <code>{segment.text}</code>
          </pre>
        ) : (
          <Fragment key={index}>{renderProse(segment.text)}</Fragment>
        ),
      )}
    </div>
  );
}

type Segment = { kind: "code"; text: string; lang: string } | { kind: "prose"; text: string };

function splitFences(text: string): Segment[] {
  const segments: Segment[] = [];
  const fence = /```([^\n`]*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = fence.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ kind: "prose", text: text.slice(lastIndex, match.index) });
    }
    segments.push({ kind: "code", lang: match[1].trim(), text: match[2].replace(/\n$/, "") });
    lastIndex = fence.lastIndex;
  }
  if (lastIndex < text.length) {
    segments.push({ kind: "prose", text: text.slice(lastIndex) });
  }
  return segments.length > 0 ? segments : [{ kind: "prose", text }];
}

function renderProse(text: string): ReactNode {
  const lines = text.split("\n");
  return lines.map((line, index) => (
    <Fragment key={index}>
      {index > 0 && <br />}
      {renderInline(line)}
    </Fragment>
  ));
}

/** Inline pass: `code`, **bold**, *italic*, and [label](url) links. */
function renderInline(line: string): ReactNode[] {
  const token = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(\[[^\]]+\]\([^)]+\))/g;
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  let match: RegExpExecArray | null;
  while ((match = token.exec(line)) !== null) {
    if (match.index > lastIndex) nodes.push(line.slice(lastIndex, match.index));
    const piece = match[0];
    if (piece.startsWith("`")) {
      nodes.push(
        <code className="ws-md-inline-code" key={key++}>
          {piece.slice(1, -1)}
        </code>,
      );
    } else if (piece.startsWith("**")) {
      nodes.push(<strong key={key++}>{piece.slice(2, -2)}</strong>);
    } else if (piece.startsWith("*")) {
      nodes.push(<em key={key++}>{piece.slice(1, -1)}</em>);
    } else {
      const linkMatch = /\[([^\]]+)\]\(([^)]+)\)/.exec(piece);
      if (linkMatch && isSafeHref(linkMatch[2])) {
        nodes.push(
          <a className="ws-md-link" href={linkMatch[2]} key={key++} rel="noreferrer" target="_blank">
            {linkMatch[1]}
          </a>,
        );
      } else if (linkMatch) {
        // Unsafe scheme (e.g. javascript:) in agent/LLM output — render the
        // label as plain text rather than a clickable code-executing link.
        nodes.push(linkMatch[1]);
      } else {
        nodes.push(piece);
      }
    }
    lastIndex = token.lastIndex;
  }
  if (lastIndex < line.length) nodes.push(line.slice(lastIndex));
  return nodes;
}
