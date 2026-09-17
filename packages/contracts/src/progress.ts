import { z } from 'zod';
import { paginatedResponseSchema } from './pagination';
import { syncStatusSchema } from './projects';

export const progressResponseSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  taskId: z.string().uuid().nullable(),
  authorId: z.string().uuid(),
  title: z.string(),
  description: z.string(),
  evidenceLinks: z.array(z.string()),
  recordedAt: z.string().datetime(),
  syncStatus: syncStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ProgressResponse = z.infer<typeof progressResponseSchema>;

export const createProgressRequestSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().min(1).max(10000),
  taskId: z.string().uuid().optional(),
  evidenceLinks: z.array(z.string().url()).max(20).optional(),
  recordedAt: z.string().datetime().optional(),
});
export type CreateProgressRequest = z.infer<typeof createProgressRequestSchema>;

export const updateProgressRequestSchema =
  createProgressRequestSchema.partial();
export type UpdateProgressRequest = z.infer<typeof updateProgressRequestSchema>;

export const listProgressQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  taskId: z.string().uuid().optional(),
  authorId: z.string().uuid().optional(),
  sortBy: z.enum(['recordedAt', 'createdAt']).default('recordedAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});
export type ListProgressQuery = z.infer<typeof listProgressQuerySchema>;

export const paginatedProgressResponseSchema = paginatedResponseSchema(
  progressResponseSchema,
);
export type PaginatedProgressResponse = z.infer<
  typeof paginatedProgressResponseSchema
>;
