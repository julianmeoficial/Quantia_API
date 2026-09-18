import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ReportKind,
  ReportStatus,
  type CreateReportRequest,
  type ReportAcceptedResponse,
  type ReportResponse,
} from '@quantia/contracts';
import { IsEnum } from 'class-validator';

export class CreateReportDto implements CreateReportRequest {
  @ApiProperty({ enum: ReportKind })
  @IsEnum(ReportKind)
  kind!: ReportKind;
}

export class ReportAcceptedResponseDto implements ReportAcceptedResponse {
  @ApiProperty({ format: 'uuid' })
  reportId!: string;

  @ApiProperty({ enum: ReportStatus })
  status!: ReportStatus;
}

export class ReportResponseDto implements ReportResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  projectId!: string;

  @ApiProperty({ format: 'uuid' })
  requestedById!: string;

  @ApiProperty({ enum: ReportKind })
  kind!: ReportKind;

  @ApiProperty({ enum: ReportStatus })
  status!: ReportStatus;

  @ApiPropertyOptional({ nullable: true })
  errorMessage!: string | null;

  @ApiPropertyOptional({ nullable: true, format: 'uri' })
  downloadUrl!: string | null;

  @ApiPropertyOptional({ nullable: true })
  expiresInSeconds!: number | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}
