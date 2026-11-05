import { z } from 'zod';

/**
 * Predefined avatars. Users must pick one before using the chat; uploading
 * photos is intentionally not supported. Frontends map each key to a bundled
 * asset (e.g. `/avatars/avatar-01.svg`) and may use `color`/`label` as fallback.
 */
export const AvatarKey = {
  AVATAR_01: 'AVATAR_01',
  AVATAR_02: 'AVATAR_02',
  AVATAR_03: 'AVATAR_03',
  AVATAR_04: 'AVATAR_04',
  AVATAR_05: 'AVATAR_05',
} as const;
export type AvatarKey = (typeof AvatarKey)[keyof typeof AvatarKey];

export const avatarKeySchema = z.enum([
  AvatarKey.AVATAR_01,
  AvatarKey.AVATAR_02,
  AvatarKey.AVATAR_03,
  AvatarKey.AVATAR_04,
  AvatarKey.AVATAR_05,
]);

export const avatarOptionSchema = z.object({
  key: avatarKeySchema,
  label: z.string(),
  /** Hex colour suggested for placeholders / rings while the asset loads. */
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
});
export type AvatarOption = z.infer<typeof avatarOptionSchema>;

export const AVATAR_CATALOG: readonly AvatarOption[] = [
  { key: AvatarKey.AVATAR_01, label: 'Átomo', color: '#4f46e5' },
  { key: AvatarKey.AVATAR_02, label: 'Microscopio', color: '#0891b2' },
  { key: AvatarKey.AVATAR_03, label: 'Hoja', color: '#16a34a' },
  { key: AvatarKey.AVATAR_04, label: 'Cohete', color: '#ea580c' },
  { key: AvatarKey.AVATAR_05, label: 'Bombillo', color: '#ca8a04' },
] as const;

export const avatarCatalogResponseSchema = z.object({
  items: z.array(avatarOptionSchema),
});
export type AvatarCatalogResponse = z.infer<typeof avatarCatalogResponseSchema>;

export const updateMyAvatarRequestSchema = z.object({
  avatar: avatarKeySchema,
});
export type UpdateMyAvatarRequest = z.infer<typeof updateMyAvatarRequestSchema>;
