import { z } from 'zod';

export const ReportKind = {
  BUDGET_PDF: 'BUDGET_PDF',
  BUDGET_EXCEL: 'BUDGET_EXCEL',
  PROGRESS_PDF: 'PROGRESS_PDF',
} as const;
export type ReportKind = (typeof ReportKind)[keyof typeof ReportKind];
export const reportKindSchema = z.enum([
  ReportKind.BUDGET_PDF,
  ReportKind.BUDGET_EXCEL,
  ReportKind.PROGRESS_PDF,
]);

export const ReportStatus = {
  QUEUED: 'QUEUED',
  PROCESSING: 'PROCESSING',
  READY: 'READY',
  FAILED: 'FAILED',
} as const;
export type ReportStatus = (typeof ReportStatus)[keyof typeof ReportStatus];
export const reportStatusSchema = z.enum([
  ReportStatus.QUEUED,
  ReportStatus.PROCESSING,
  ReportStatus.READY,
  ReportStatus.FAILED,
]);

export const createReportRequestSchema = z.object({
  kind: reportKindSchema,
});
export type CreateReportRequest = z.infer<typeof createReportRequestSchema>;

export const reportAcceptedResponseSchema = z.object({
  reportId: z.string().uuid(),
  status: reportStatusSchema,
});
export type ReportAcceptedResponse = z.infer<
  typeof reportAcceptedResponseSchema
>;

export const reportResponseSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  requestedById: z.string().uuid(),
  kind: reportKindSchema,
  status: reportStatusSchema,
  errorMessage: z.string().nullable(),
  downloadUrl: z.string().url().nullable(),
  expiresInSeconds: z.number().int().positive().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ReportResponse = z.infer<typeof reportResponseSchema>;
