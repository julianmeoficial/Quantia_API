import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { CHAT_GENERAL_MESSAGE_HARD_MAX } from '@quantia/contracts';

export class CreateGeneralChatMessageDto {
  @ApiProperty({
    minLength: 1,
    maxLength: CHAT_GENERAL_MESSAGE_HARD_MAX,
    description: 'Message body (trimmed). Service may enforce a lower env max.',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(CHAT_GENERAL_MESSAGE_HARD_MAX)
  content!: string;

  @ApiPropertyOptional({
    minLength: 1,
    maxLength: 64,
    description: 'Client-generated idempotency key (unique per author).',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  clientMessageId?: string;
}

/**
 * Cursor pagination (ENG-171). Deviates from page/pageSize because chat is
 * append-only and offset pages shift under concurrent writes.
 */
export class ListGeneralChatMessagesQueryDto {
  @ApiPropertyOptional({
    description: 'Opaque cursor from a previous `nextCursor` (base64url).',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
