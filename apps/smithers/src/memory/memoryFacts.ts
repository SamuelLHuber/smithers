/** A cross-run memory fact, scored by similarity on recall. */
export type MemoryFact = {
  id: string;
  namespace: string;
  text: string;
  /** Base relevance; recall nudges it by keyword overlap with the query. */
  weight: number;
};

export const MEMORY_FACTS: MemoryFact[] = [
  {
    id: "f1",
    namespace: "ci",
    text: "Token TTL races the clock skew on CI; rotation must use a fixed ROTATE_TTL, not wall time.",
    weight: 0.94,
  },
  {
    id: "f2",
    namespace: "auth",
    text: "session.ts signs tokens synchronously; the suite assumed async and flaked under load.",
    weight: 0.88,
  },
  {
    id: "f3",
    namespace: "infra",
    text: "Bun mock.module leaks across concurrent test files; prefer DI seams over module mocks.",
    weight: 0.81,
  },
  {
    id: "f4",
    namespace: "review",
    text: "Open Code Review uses the native Smithers review flow; post findings as inline comments.",
    weight: 0.74,
  },
];

/** Rank facts for a recall query: keyword overlap on top of base weight. */
export function recall(query: string, topK = 3): Array<MemoryFact & { sim: number }> {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return MEMORY_FACTS.map((fact) => {
    const hits = terms.filter((term) => fact.text.toLowerCase().includes(term)).length;
    const sim = Math.min(0.99, fact.weight + hits * 0.02);
    return { ...fact, sim };
  })
    .sort((a, b) => b.sim - a.sim)
    .slice(0, topK);
}
