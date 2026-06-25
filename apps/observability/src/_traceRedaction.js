/**
 * @typedef {{ value: unknown; applied: boolean; ruleIds: string[] }} RedactionResult
 */

/** @type {Array<{ id: string; pattern: RegExp; replace: string }>} */
const rules = [
    {
        id: "api-key",
        // Covers Stripe-style `sk_`/`pk_` AND the hyphenated provider keys
        // Smithers actually drives: OpenAI `sk-…`/`sk-proj-…` and Anthropic
        // `sk-ant-api03-…`. The separator after sk/pk may be `-` or `_`, and the
        // body may contain further `-`/`_` segments (namespaces like `proj-`,
        // `ant-`, `api03-`).
        pattern: /\b(?:sk|pk)[-_][A-Za-z0-9][A-Za-z0-9_-]{7,}\b/g,
        replace: "[REDACTED_API_KEY]",
    },
    {
        id: "bearer-token",
        pattern: /Bearer\s+[A-Za-z0-9._-]{8,}/gi,
        replace: "Bearer [REDACTED_TOKEN]",
    },
    {
        id: "auth-header",
        pattern: /"authorization"\s*:\s*"[^"]+"/gi,
        replace: '"authorization":"[REDACTED]"',
    },
    {
        id: "cookie-header",
        pattern: /"cookie"\s*:\s*"[^"]+"/gi,
        replace: '"cookie":"[REDACTED]"',
    },
    {
        id: "secret-ish",
        // Negative lookbehind (not `\b`) so an underscore-joined prefix like
        // `ANTHROPIC_API_KEY=` still matches: `_` is a word char, so `\bapi`
        // never fired after it, leaking env-style key dumps.
        pattern: /(?<![A-Za-z0-9])(?:api[_-]?key|token|secret|password)=([^\s"']+)/gi,
        // No `replace` field: redactValue special-cases this rule by id and
        // rewrites the captured value itself, so a top-level replace is never read.
    },
];

/**
 * @param {unknown} value
 * @returns {RedactionResult}
 */
export function redactValue(value) {
    const input = typeof value === "string" ? value : JSON.stringify(value ?? null);
    let next = input;
    /** @type {Set<string>} */
    const applied = new Set();
    for (const rule of rules) {
        next = next.replace(rule.pattern, (match) => {
            applied.add(rule.id);
            if (rule.id === "secret-ish") {
                const idx = match.indexOf("=");
                return `${match.slice(0, idx + 1)}[REDACTED_SECRET]`;
            }
            return rule.replace;
        });
    }
    if (applied.size === 0) return { value, applied: false, ruleIds: [] };
    if (typeof value === "string") {
        return { value: next, applied: true, ruleIds: [...applied] };
    }
    try {
        return { value: JSON.parse(next), applied: true, ruleIds: [...applied] };
    } catch {
        return { value: next, applied: true, ruleIds: [...applied] };
    }
}
