import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ProjectStatus,
  SyncStatus,
  type ProjectResponse,
} from '@quantia/contracts';

export class ProjectResponseDto implements ProjectResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiPropertyOptional({ nullable: true })
  description!: string | null;

  @ApiPropertyOptional({ nullable: true })
  objectives!: string | null;

  @ApiProperty({ enum: ProjectStatus })
  status!: ProjectStatus;

  @ApiPropertyOptional({ nullable: true, format: 'date-time' })
  startDate!: string | null;

  @ApiPropertyOptional({ nullable: true, format: 'date-time' })
  endDate!: string | null;

  @ApiProperty({ format: 'uuid' })
  coordinatorId!: string;

  @ApiProperty({ format: 'uuid' })
  createdById!: string;

  @ApiProperty({ type: [String], format: 'uuid' })
  memberIds!: string[];

  @ApiProperty({ enum: SyncStatus })
  syncStatus!: SyncStatus;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}
