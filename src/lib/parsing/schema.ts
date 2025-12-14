import { z } from "zod";

export const llmJsonSchema = z.object({
  type: z.enum(["subscription", "order", "membership", "unknown"]),
  merchant: z.string().min(1).max(120),
  product: z.string().min(1).max(180),
  amount: z.number().nullable(),
  currency: z.string().min(1).max(12),
  transaction_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  renewal_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  is_recurring: z.boolean(),
  cancel_url: z.string().url().nullable(),
  confidence: z.number().min(0).max(1),
  evidence: z.object({
    reason: z.string().min(1).max(500),
    snippets: z.array(z.string().min(1).max(1000)).min(1).max(4),
  }),
});

export type LlmJson = z.infer<typeof llmJsonSchema>;

export const parsedItemCoreSchema = z.object({
  type: z.enum(["subscription", "order", "membership", "unknown"]),
  merchant: z.string().min(1).max(120),
  product: z.string().min(1).max(180),
  amount: z.number().nullable(),
  currency: z.string().min(1).max(12),
  transactionDate: z.date().nullable(),
  renewalDate: z.date().nullable(),
  isRecurring: z.boolean(),
  cancelUrl: z.string().url().nullable(),
  confidence: z.number().min(0).max(1),
  evidenceReason: z.string().min(1).max(800),
  evidenceSnippets: z.array(z.string().min(1).max(1000)).min(1).max(4),
  llmUsed: z.boolean(),
  llmUnavailable: z.boolean().optional(),
});

export type ParsedItemCore = z.infer<typeof parsedItemCoreSchema>;
