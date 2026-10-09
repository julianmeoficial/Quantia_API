import { z } from 'zod';
import { paginatedResponseSchema } from './pagination';

export const USER_DIRECTORY_QUERY_MIN_LENGTH = 2;
export const USER_DIRECTORY_QUERY_MAX_LENGTH = 100;
export const USER_DIRECTORY_PAGE_SIZE_MAX = 50;

/**
 * Minimal user card for member pickers (ADMINISTRADOR / COORDINADOR only).
 * Never roles, activity flags, timestamps or Notion ids.
 */
export const userDirectoryEntrySchema = z.object({
  id: z.string().uuid(),
  fullName: z.string(),
  email: z.string().email(),
});
export type UserDirectoryEntry = z.infer<typeof userDirectoryEntrySchema>;

export const userDirectoryQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .min(USER_DIRECTORY_QUERY_MIN_LENGTH)
    .max(USER_DIRECTORY_QUERY_MAX_LENGTH),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce
    .number()
    .int()
    .positive()
    .max(USER_DIRECTORY_PAGE_SIZE_MAX)
    .default(20),
});
export type UserDirectoryQuery = z.infer<typeof userDirectoryQuerySchema>;

export const paginatedUserDirectoryResponseSchema = paginatedResponseSchema(
  userDirectoryEntrySchema,
);
export type PaginatedUserDirectoryResponse = z.infer<
  typeof paginatedUserDirectoryResponseSchema
>;
