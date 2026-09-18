import { z } from 'zod';

export const BudgetExecutionKind = {
  COMMITMENT: 'COMMITMENT',
  PAYMENT: 'PAYMENT',
  ADJUSTMENT: 'ADJUSTMENT',
} as const;
export type BudgetExecutionKind =
  (typeof BudgetExecutionKind)[keyof typeof BudgetExecutionKind];
export const budgetExecutionKindSchema = z.enum([
  BudgetExecutionKind.COMMITMENT,
  BudgetExecutionKind.PAYMENT,
  BudgetExecutionKind.ADJUSTMENT,
]);

export const budgetItemSchema = z.object({
  id: z.string().uuid(),
  category: z.string(),
  plannedAmount: z.string(),
  notes: z.string().nullable(),
});
export type BudgetItemResponse = z.infer<typeof budgetItemSchema>;

export const budgetExecutionSchema = z.object({
  id: z.string().uuid(),
  itemId: z.string().uuid().nullable(),
  kind: budgetExecutionKindSchema,
  amount: z.string(),
  occurredAt: z.string().datetime(),
  registeredById: z.string().uuid(),
  note: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type BudgetExecutionResponse = z.infer<typeof budgetExecutionSchema>;

export const budgetResponseSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  totalAmount: z.string(),
  currency: z.string().length(3),
  alertThresholdPercent: z.number().int(),
  executedAmount: z.string(),
  executedPercent: z.number(),
  items: z.array(budgetItemSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type BudgetResponse = z.infer<typeof budgetResponseSchema>;

export const createBudgetRequestSchema = z.object({
  totalAmount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  currency: z.string().length(3).default('COP'),
  alertThresholdPercent: z.number().int().min(0).max(100).optional(),
  items: z
    .array(
      z.object({
        category: z.string().min(1).max(200),
        plannedAmount: z.string().regex(/^\d+(\.\d{1,2})?$/),
        notes: z.string().max(2000).optional(),
      }),
    )
    .optional(),
});
export type CreateBudgetRequest = z.infer<typeof createBudgetRequestSchema>;

export const updateBudgetRequestSchema = createBudgetRequestSchema.partial();
export type UpdateBudgetRequest = z.infer<typeof updateBudgetRequestSchema>;

export const createBudgetExecutionRequestSchema = z.object({
  itemId: z.string().uuid().optional(),
  kind: budgetExecutionKindSchema,
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  occurredAt: z.string().datetime().optional(),
  note: z.string().max(2000).optional(),
});
export type CreateBudgetExecutionRequest = z.infer<
  typeof createBudgetExecutionRequestSchema
>;
