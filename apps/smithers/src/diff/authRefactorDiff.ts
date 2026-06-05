import type { Diff } from "./Diff";

/**
 * The seeded diff for the auth-refactor run. A real build would assemble this
 * from the run's DiffBundle; the shape is the same.
 */
export const AUTH_REFACTOR_DIFF: Diff = {
  id: "auth",
  title: "Changes · auth refactor",
  totalAdd: 214,
  totalDel: 63,
  files: [
    {
      path: "auth/session.ts",
      add: 22,
      del: 8,
      lines: [
        { kind: "context", ln: 41, text: "export function createSession(user: User) {" },
        { kind: "del", text: "  const token = sign(user.id)" },
        { kind: "add", ln: 42, text: "  const token = sign(user.id, { ttl: ROTATE_TTL })" },
        { kind: "add", ln: 43, text: "  schedule(rotate, ROTATE_TTL)" },
        { kind: "context", ln: 44, text: "  return { token, user }" },
      ],
    },
    {
      path: "auth/token.ts",
      add: 31,
      del: 9,
      lines: [
        { kind: "context", ln: 12, text: "export function sign(id: string, opts: SignOpts = {}) {" },
        { kind: "del", text: "  return jwt.sign({ id })" },
        { kind: "add", ln: 13, text: "  const ttl = opts.ttl ?? DEFAULT_TTL" },
        { kind: "add", ln: 14, text: "  return jwt.sign({ id }, { expiresIn: ttl })" },
        { kind: "context", ln: 15, text: "}" },
      ],
    },
    {
      path: "auth/index.ts",
      add: 6,
      del: 2,
      lines: [
        { kind: "context", ln: 3, text: "export { createSession } from \"./session\"" },
        { kind: "add", ln: 4, text: "export { rotate } from \"./rotate\"" },
      ],
    },
  ],
};
