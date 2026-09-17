import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SyncStatus, type ProgressResponse } from '@quantia/contracts';

export class ProgressResponseDto implements ProgressResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  projectId!: string;

  @ApiPropertyOptional({ nullable: true, format: 'uuid' })
  taskId!: string | null;

  @ApiProperty({ format: 'uuid' })
  authorId!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty({ type: [String] })
  evidenceLinks!: string[];

  @ApiProperty({ format: 'date-time' })
  recordedAt!: string;

  @ApiProperty({ enum: SyncStatus })
  syncStatus!: SyncStatus;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}
