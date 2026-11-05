import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  AvatarKey,
  CHAT_GENERAL_MESSAGE_HARD_MAX,
  CHAT_GENERAL_REACTIONS,
  type ChatGeneralReaction,
} from '@quantia/contracts';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateGeneralChatMessageDto {
  @ApiProperty({
    minLength: 1,
    maxLength: CHAT_GENERAL_MESSAGE_HARD_MAX,
    description:
      'Plain text (trimmed, control chars stripped). Service enforces CHAT_GENERAL_MESSAGE_MAX_LENGTH.',
  })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(CHAT_GENERAL_MESSAGE_HARD_MAX)
  content!: string;

  @ApiPropertyOptional({
    minLength: 1,
    maxLength: 64,
    description:
      'Client-generated idempotency key (unique per author). Echoed back so the optimistic bubble can be swapped in place.',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  clientMessageId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Reply to (quote) another live message.',
  })
  @IsOptional()
  @IsUUID()
  replyToId?: string;
}

export class EditGeneralChatMessageDto {
  @ApiProperty({ minLength: 1, maxLength: CHAT_GENERAL_MESSAGE_HARD_MAX })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(CHAT_GENERAL_MESSAGE_HARD_MAX)
  content!: string;
}

export class SetGeneralChatReactionDto {
  @ApiProperty({ enum: CHAT_GENERAL_REACTIONS, example: '👍' })
  @IsIn([...CHAT_GENERAL_REACTIONS])
  emoji!: ChatGeneralReaction;
}

export class MarkGeneralChatReadDto {
  @ApiProperty({
    minimum: 0,
    description: '`seq` of the newest message visible on screen.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  lastReadSeq!: number;
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
  @MaxLength(256)
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class ListGeneralChatUpdatesQueryDto {
  @ApiPropertyOptional({
    format: 'date-time',
    description:
      'Return changes after this instant (use the previous `serverTime`, minus a few seconds of overlap).',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  since?: string;

  @ApiPropertyOptional({
    description: 'Opaque `nextCursor` from a previous page.',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

// ---------------- Swagger response models (documentation only) ----------------

export class PresenceUserDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: AvatarKey, nullable: true }) avatar!: AvatarKey | null;
  @ApiProperty({
    nullable: true,
    type: String,
    deprecated: true,
    example: null,
  })
  avatarUrl!: null;
}

export class GeneralChatReplyPreviewDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() seq!: number;
  @ApiProperty({ type: PresenceUserDto }) author!: PresenceUserDto;
  @ApiProperty({ nullable: true, type: String }) excerpt!: string | null;
  @ApiProperty() deleted!: boolean;
}

export class GeneralChatReactionSummaryDto {
  @ApiProperty({ enum: CHAT_GENERAL_REACTIONS }) emoji!: string;
  @ApiProperty() count!: number;
  @ApiProperty({ type: [String], format: 'uuid' }) userIds!: string[];
}

export class GeneralChatMessageResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ description: 'Monotonic order key' }) seq!: number;
  @ApiProperty({ description: 'Bumped on every change' }) version!: number;
  @ApiProperty({ description: 'Empty when deleted' }) content!: string;
  @ApiProperty({ nullable: true, type: String }) clientMessageId!:
    string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  editedAt!: string | null;
  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  deletedAt!: string | null;
  @ApiProperty({ type: PresenceUserDto }) author!: PresenceUserDto;
  @ApiProperty({ type: GeneralChatReplyPreviewDto, nullable: true })
  replyTo!: GeneralChatReplyPreviewDto | null;
  @ApiProperty({ type: [GeneralChatReactionSummaryDto] })
  reactions!: GeneralChatReactionSummaryDto[];
}

export class GeneralChatMessageEnvelopeDto {
  @ApiProperty({ type: GeneralChatMessageResponseDto })
  message!: GeneralChatMessageResponseDto;
}

export class GeneralChatHistoryResponseDto {
  @ApiProperty({ type: [GeneralChatMessageResponseDto] })
  items!: GeneralChatMessageResponseDto[];
  @ApiProperty({ nullable: true, type: String }) nextCursor!: string | null;
  @ApiProperty() hasMore!: boolean;
}

export class GeneralChatUpdatesResponseDto extends GeneralChatHistoryResponseDto {
  @ApiProperty({ format: 'date-time' }) serverTime!: string;
}

export class MarkGeneralChatReadResponseDto {
  @ApiProperty() lastReadSeq!: number;
  @ApiProperty() unreadCount!: number;
}
