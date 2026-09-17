import { z } from 'zod';

export const RoleName = {
  INVESTIGADOR: 'INVESTIGADOR',
  COORDINADOR: 'COORDINADOR',
  ADMINISTRADOR: 'ADMINISTRADOR',
} as const;

export type RoleName = (typeof RoleName)[keyof typeof RoleName];

export const roleNameSchema = z.enum([
  RoleName.INVESTIGADOR,
  RoleName.COORDINADOR,
  RoleName.ADMINISTRADOR,
]);

export const loginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const refreshRequestSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshRequest = z.infer<typeof refreshRequestSchema>;

export const logoutRequestSchema = z.object({
  refreshToken: z.string().min(1),
});
export type LogoutRequest = z.infer<typeof logoutRequestSchema>;

export const authTokensResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  tokenType: z.literal('Bearer'),
  expiresIn: z.number().int().positive(),
});
export type AuthTokensResponse = z.infer<typeof authTokensResponseSchema>;

export const userResponseSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  fullName: z.string(),
  isActive: z.boolean(),
  roles: z.array(roleNameSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type UserResponse = z.infer<typeof userResponseSchema>;

export const createUserRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(1).max(200),
  roles: z.array(roleNameSchema).min(1),
  isActive: z.boolean().optional().default(true),
});
export type CreateUserRequest = z.infer<typeof createUserRequestSchema>;

export const updateUserRequestSchema = z.object({
  email: z.string().email().optional(),
  password: z.string().min(8).optional(),
  fullName: z.string().min(1).max(200).optional(),
  roles: z.array(roleNameSchema).min(1).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateUserRequest = z.infer<typeof updateUserRequestSchema>;

export const paginatedUsersResponseSchema = z.object({
  data: z.array(userResponseSchema),
  meta: z.object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  }),
});
export type PaginatedUsersResponse = z.infer<
  typeof paginatedUsersResponseSchema
>;
