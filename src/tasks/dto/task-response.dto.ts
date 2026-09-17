import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  SyncStatus,
  TaskPriority,
  TaskStatus,
  type TaskResponse,
} from '@quantia/contracts';

export class TaskResponseDto implements TaskResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  projectId!: string;

  @ApiProperty()
  title!: string;

  @ApiPropertyOptional({ nullable: true })
  description!: string | null;

  @ApiPropertyOptional({ nullable: true, format: 'uuid' })
  assigneeId!: string | null;

  @ApiProperty({ enum: TaskStatus })
  status!: TaskStatus;

  @ApiProperty({ enum: TaskPriority })
  priority!: TaskPriority;

  @ApiPropertyOptional({ nullable: true, format: 'date-time' })
  dueDate!: string | null;

  @ApiProperty({ enum: SyncStatus })
  syncStatus!: SyncStatus;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}
