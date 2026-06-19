/**
 * Ambient context handed to in-process agent tools while a node attempt runs.
 * Every field is optional so partial contexts (and the durability-inactive
 * `null` path) are accepted; helpers degrade gracefully when fields are absent.
 */
interface ToolContext {
    /** The run this tool execution belongs to. */
    runId?: string;
    /** The node this tool execution belongs to. */
    nodeId?: string;
    /** The node iteration (defaults to 0 in keys). */
    iteration?: number;
    /** The attempt number for the current node. */
    attempt?: number;
    /** The working directory / VCS root for the tool. */
    rootDir?: string;
    /** Explicit idempotency key override. */
    idempotencyKey?: string;
    /** Monotonic per-context tool sequence (mutated by nextToolSeq). */
    seq?: number;
    /** Hook to snapshot workspace durability mid-tool. */
    durabilitySnapshot?: (label?: string, toolUseId?: string) => unknown;
}
/**
 * Run `fn` with `ctx` as the ambient tool-execution context. Tool `execute`
 * functions invoked anywhere inside (including across awaits) can read it with
 * getToolContext(). Used by the engine to give in-process agent tools their
 * run/node/cwd context and a durability snapshot hook.
 *
 * @template T
 * @param {ToolContext} ctx
 * @param {() => T} fn
 * @returns {T}
 */
declare function runWithToolContext<T>(ctx: ToolContext, fn: () => T): T;
/**
 * @returns {ToolContext | undefined}
 */
declare function getToolContext(): ToolContext | undefined;
/**
 * @param {ToolContext} [ctx]
 * @returns {string | null}
 */
declare function getToolIdempotencyKey(ctx?: ToolContext): string | null;
/**
 * @param {ToolContext} ctx
 * @returns {number}
 */
declare function nextToolSeq(ctx: ToolContext): number;

export { type ToolContext, getToolContext, getToolIdempotencyKey, nextToolSeq, runWithToolContext };
