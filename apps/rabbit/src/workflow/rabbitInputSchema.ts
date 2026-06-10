import { openCodeReviewInputSchema } from "smithers-workflows/lib/open-code-review";
import { z } from "zod/v4";

export const rabbitInputSchema = openCodeReviewInputSchema.extend({
  out: z.string().default(""),
  narrate: z.boolean().default(true),
  title: z.string().default(""),
});

export type RabbitInput = z.infer<typeof rabbitInputSchema>;
