import { z } from 'zod';
import { paginatedResponseSchema } from './pagination';

export const DocumentStatus = {
  UPLOADED: 'UPLOADED',
  SCANNED: 'SCANNED',
  QUARANTINED: 'QUARANTINED',
} as const;
export type DocumentStatus =
  (typeof DocumentStatus)[keyof typeof DocumentStatus];
export const documentStatusSchema = z.enum([
  DocumentStatus.UPLOADED,
  DocumentStatus.SCANNED,
  DocumentStatus.QUARANTINED,
]);

export const documentResponseSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  uploadedById: z.string().uuid(),
  originalName: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int(),
  status: documentStatusSchema,
  createdAt: z.string().datetime(),
});
export type DocumentResponse = z.infer<typeof documentResponseSchema>;

export const documentDownloadResponseSchema = z.object({
  documentId: z.string().uuid(),
  url: z.string().url(),
  expiresInSeconds: z.number().int().positive(),
});
export type DocumentDownloadResponse = z.infer<
  typeof documentDownloadResponseSchema
>;

export const listDocumentsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});
export type ListDocumentsQuery = z.infer<typeof listDocumentsQuerySchema>;

export const paginatedDocumentsSchema = paginatedResponseSchema(
  documentResponseSchema,
);
