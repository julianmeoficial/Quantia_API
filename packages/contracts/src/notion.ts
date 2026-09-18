import { z } from 'zod';

export const SyncEntityType = {
  USER: 'USER',
  PROJECT: 'PROJECT',
  TASK: 'TASK',
  PROGRESS: 'PROGRESS',
} as const;
export type SyncEntityType =
  (typeof SyncEntityType)[keyof typeof SyncEntityType];
export const syncEntityTypeSchema = z.enum([
  SyncEntityType.USER,
  SyncEntityType.PROJECT,
  SyncEntityType.TASK,
  SyncEntityType.PROGRESS,
]);

export const SyncJobName = {
  NOTION_TO_DB: 'sync:notion-to-db',
  DB_TO_NOTION: 'sync:db-to-notion',
} as const;
export type SyncJobName = (typeof SyncJobName)[keyof typeof SyncJobName];

export const notionWebhookVerificationSchema = z.object({
  verification_token: z.string().min(1),
});
export type NotionWebhookVerification = z.infer<
  typeof notionWebhookVerificationSchema
>;

export const notionWebhookEventSchema = z.object({
  id: z.string().optional(),
  type: z.string().optional(),
  timestamp: z.string().optional(),
  entity: z
    .object({
      id: z.string(),
      type: z.string().optional(),
    })
    .optional(),
  data: z.record(z.string(), z.unknown()).optional(),
});
export type NotionWebhookEvent = z.infer<typeof notionWebhookEventSchema>;

export const syncNotionToDbJobSchema = z.object({
  notionPageId: z.string().min(1),
  entityType: syncEntityTypeSchema.optional(),
  lastEditedTime: z.string().datetime().optional(),
  syncEventId: z.string().uuid().optional(),
});
export type SyncNotionToDbJob = z.infer<typeof syncNotionToDbJobSchema>;

export const syncDbToNotionJobSchema = z.object({
  entityType: syncEntityTypeSchema,
  entityId: z.string().uuid(),
  syncEventId: z.string().uuid().optional(),
});
export type SyncDbToNotionJob = z.infer<typeof syncDbToNotionJobSchema>;
