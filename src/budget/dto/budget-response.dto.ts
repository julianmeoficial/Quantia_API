import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  BudgetExecutionKind,
  type BudgetExecutionResponse,
  type BudgetItemResponse,
  type BudgetResponse,
} from '@quantia/contracts';

export class BudgetItemResponseDto implements BudgetItemResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  category!: string;

  @ApiProperty()
  plannedAmount!: string;

  @ApiPropertyOptional({ nullable: true })
  notes!: string | null;
}

export class BudgetExecutionResponseDto implements BudgetExecutionResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  itemId!: string | null;

  @ApiProperty({ enum: BudgetExecutionKind })
  kind!: BudgetExecutionKind;

  @ApiProperty()
  amount!: string;

  @ApiProperty({ format: 'date-time' })
  occurredAt!: string;

  @ApiProperty({ format: 'uuid' })
  registeredById!: string;

  @ApiPropertyOptional({ nullable: true })
  note!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

export class BudgetResponseDto implements BudgetResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  projectId!: string;

  @ApiProperty()
  totalAmount!: string;

  @ApiProperty({ minLength: 3, maxLength: 3 })
  currency!: string;

  @ApiProperty()
  alertThresholdPercent!: number;

  @ApiProperty()
  executedAmount!: string;

  @ApiProperty()
  executedPercent!: number;

  @ApiProperty({ type: [BudgetItemResponseDto] })
  items!: BudgetItemResponseDto[];

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}
