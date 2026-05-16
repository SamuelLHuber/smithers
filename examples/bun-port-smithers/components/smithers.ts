import { createSmithers } from "smithers-orchestrator";
import type { z } from "zod";

export function createBunPortSmithers<const Schemas extends Record<string, z.ZodObject<any>>>(
  schemas: Schemas,
) {
  return createSmithers(schemas, {
    dbPath: process.env.BUN_PORT_SMITHERS_DB ?? "examples/bun-port-smithers/.tmp/smithers.db",
  });
}
