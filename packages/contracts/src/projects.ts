import { z } from 'zod';
import { paginatedResponseSchema } from './pagination';

export const ProjectStatus = {
  FORMULATION: 'FORMULATION',
  ACTIVE: 'ACTIVE',
  DELAYED: 'DELAYED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;
export type ProjectStatus = (typeof ProjectStatus)[keyof typeof ProjectStatus];
export const projectStatusSchema = z.enum([
  ProjectStatus.FORMULATION,
  ProjectStatus.ACTIVE,
  ProjectStatus.DELAYED,
  ProjectStatus.COMPLETED,
  ProjectStatus.CANCELLED,
]);

export const SyncStatus = {
  PENDING: 'PENDING',
  SYNCED: 'SYNCED',
  FAILED: 'FAILED',
} as const;
export type SyncStatus = (typeof SyncStatus)[keyof typeof SyncStatus];
export const syncStatusSchema = z.enum([
  SyncStatus.PENDING,
  SyncStatus.SYNCED,
  SyncStatus.FAILED,
]);

export const projectResponseSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  objectives: z.string().nullable(),
  status: projectStatusSchema,
  startDate: z.string().datetime().nullable(),
  endDate: z.string().datetime().nullable(),
  coordinatorId: z.string().uuid(),
  createdById: z.string().uuid(),
  memberIds: z.array(z.string().uuid()),
  syncStatus: syncStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ProjectResponse = z.infer<typeof projectResponseSchema>;

export const createProjectRequestSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(5000).optional(),
  objectives: z.string().max(5000).optional(),
  status: projectStatusSchema.optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  coordinatorId: z.string().uuid().optional(),
  memberIds: z.array(z.string().uuid()).optional(),
});
export type CreateProjectRequest = z.infer<typeof createProjectRequestSchema>;

export const updateProjectRequestSchema = createProjectRequestSchema.partial();
export type UpdateProjectRequest = z.infer<typeof updateProjectRequestSchema>;

export const addProjectMemberRequestSchema = z.object({
  userId: z.string().uuid(),
});
export type AddProjectMemberRequest = z.infer<
  typeof addProjectMemberRequestSchema
>;

export const listProjectsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  status: projectStatusSchema.optional(),
  q: z.string().optional(),
  sortBy: z.enum(['createdAt', 'title', 'status']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});
export type ListProjectsQuery = z.infer<typeof listProjectsQuerySchema>;

export const paginatedProjectsResponseSchema = paginatedResponseSchema(
  projectResponseSchema,
);
export type PaginatedProjectsResponse = z.infer<
  typeof paginatedProjectsResponseSchema
>;
