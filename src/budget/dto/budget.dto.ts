import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BudgetExecutionKind } from '@quantia/contracts';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

const AMOUNT_REGEX = /^\d+(\.\d{1,2})?$/;

export class BudgetItemInputDto {
  @ApiProperty({ minLength: 1, maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  category!: string;

  @ApiProperty({ example: '1000.00' })
  @IsString()
  @Matches(AMOUNT_REGEX)
  plannedAmount!: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class CreateBudgetDto {
  @ApiProperty({ example: '10000.00' })
  @IsString()
  @Matches(AMOUNT_REGEX)
  totalAmount!: string;

  @ApiPropertyOptional({ minLength: 3, maxLength: 3, default: 'COP' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(3)
  currency?: string = 'COP';

  @ApiPropertyOptional({ minimum: 0, maximum: 100, default: 80 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  alertThresholdPercent?: number;

  @ApiPropertyOptional({ type: [BudgetItemInputDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => BudgetItemInputDto)
  items?: BudgetItemInputDto[];
}

export class UpdateBudgetDto {
  @ApiPropertyOptional({ example: '10000.00' })
  @IsOptional()
  @IsString()
  @Matches(AMOUNT_REGEX)
  totalAmount?: string;

  @ApiPropertyOptional({ minLength: 3, maxLength: 3 })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(3)
  currency?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  alertThresholdPercent?: number;

  @ApiPropertyOptional({ type: [BudgetItemInputDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => BudgetItemInputDto)
  items?: BudgetItemInputDto[];
}

export class CreateBudgetExecutionDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  itemId?: string;

  @ApiProperty({ enum: BudgetExecutionKind })
  @IsEnum(BudgetExecutionKind)
  kind!: BudgetExecutionKind;

  @ApiProperty({ example: '250.00' })
  @IsString()
  @Matches(AMOUNT_REGEX)
  amount!: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class ListBudgetExecutionsQueryDto extends PaginationQueryDto {}
