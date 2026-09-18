export const REPORTS_QUEUE = 'reports';

export const REPORT_JOB = {
  GENERATE: 'report:generate',
} as const;

export type GenerateReportJobData = {
  reportId: string;
};
