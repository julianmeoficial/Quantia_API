import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import {
  type GeneralChatHistoryResponse,
  type GeneralChatMessageDto,
  type PresenceUser,
} from '@quantia/contracts';
import type { AuthenticatedUser } from '../common/interfaces/jwt-payload.interface';
import type { EnvConfig } from '../config/env.schema';
import { RealtimeEmitter } from '../realtime/realtime-emitter.service';
import {
  ChatGeneralRepository,
  type GeneralChatMessageWithAuthor,
} from './chat-general.repository';
import type {
  CreateGeneralChatMessageDto,
  ListGeneralChatMessagesQueryDto,
} from './dto/chat-general.dto';

@Injectable()
export class ChatGeneralService {
  constructor(
    private readonly repo: ChatGeneralRepository,
    private readonly config: ConfigService<EnvConfig, true>,
    private readonly realtime: RealtimeEmitter,
  ) {}

  assertEnabled(): void {
    if (!this.config.get('CHAT_GENERAL_ENABLED', { infer: true })) {
      throw new NotFoundException('Chat General is not enabled');
    }
  }

  async create(
    user: AuthenticatedUser,
    dto: CreateGeneralChatMessageDto,
  ): Promise<{ message: GeneralChatMessageDto; created: boolean }> {
    this.assertEnabled();

    const maxLen = this.config.get('CHAT_GENERAL_MESSAGE_MAX_LENGTH', {
      infer: true,
    });
    const content = dto.content.trim();
    if (content.length === 0) {
      throw new BadRequestException('content must not be empty');
    }
    if (content.length > maxLen) {
      throw new BadRequestException(
        `content must be at most ${maxLen} characters`,
      );
    }

    try {
      const row = await this.repo.create({
        authorId: user.id,
        content,
        clientMessageId: dto.clientMessageId,
      });
      const message = this.toMessageDto(row);
      await this.realtime.emitChatGeneralMensajeCreado({ message });
      return { message, created: true };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        dto.clientMessageId
      ) {
        const existing = await this.repo.findBySenderAndClientMessageId(
          user.id,
          dto.clientMessageId,
        );
        if (existing) {
          return { message: this.toMessageDto(existing), created: false };
        }
      }
      throw error;
    }
  }

  async listHistory(
    query: ListGeneralChatMessagesQueryDto,
  ): Promise<GeneralChatHistoryResponse> {
    this.assertEnabled();

    const defaultLimit = this.config.get('CHAT_GENERAL_HISTORY_DEFAULT_LIMIT', {
      infer: true,
    });
    const maxLimit = this.config.get('CHAT_GENERAL_HISTORY_MAX_LIMIT', {
      infer: true,
    });
    const requested = query.limit ?? defaultLimit;
    const limit = Math.min(requested, maxLimit);

    let cursorCreatedAt: Date | undefined;
    let cursorId: string | undefined;
    if (query.cursor) {
      const decoded = this.decodeCursor(query.cursor);
      cursorCreatedAt = decoded.createdAt;
      cursorId = decoded.id;
    }

    const rows = await this.repo.findHistory({
      limit: limit + 1,
      cursorCreatedAt,
      cursorId,
    });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    const nextCursor =
      hasMore && last ? this.encodeCursor(last.createdAt, last.id) : null;

    return {
      items: page.map((row) => this.toMessageDto(row)),
      nextCursor,
      hasMore,
    };
  }

  toPresenceUser(user: { id: string; fullName: string }): PresenceUser {
    return {
      id: user.id,
      name: user.fullName,
      avatarUrl: null,
    };
  }

  async resolvePresenceUsers(userIds: string[]): Promise<PresenceUser[]> {
    const users = await this.repo.findActiveUsersByIds(userIds);
    const byId = new Map(users.map((u) => [u.id, u]));
    return userIds
      .map((id) => byId.get(id))
      .filter((u): u is { id: string; fullName: string } => u != null)
      .map((u) => this.toPresenceUser(u));
  }

  private toMessageDto(
    row: GeneralChatMessageWithAuthor,
  ): GeneralChatMessageDto {
    return {
      id: row.id,
      content: row.content,
      clientMessageId: row.clientMessageId,
      createdAt: row.createdAt.toISOString(),
      author: this.toPresenceUser(row.author),
    };
  }

  encodeCursor(createdAt: Date, id: string): string {
    return Buffer.from(`${createdAt.toISOString()}|${id}`, 'utf8').toString(
      'base64url',
    );
  }

  decodeCursor(cursor: string): { createdAt: Date; id: string } {
    let raw: string;
    try {
      raw = Buffer.from(cursor, 'base64url').toString('utf8');
    } catch {
      throw new BadRequestException('Invalid cursor');
    }
    const sep = raw.lastIndexOf('|');
    if (sep <= 0) {
      throw new BadRequestException('Invalid cursor');
    }
    const iso = raw.slice(0, sep);
    const id = raw.slice(sep + 1);
    const createdAt = new Date(iso);
    if (Number.isNaN(createdAt.getTime()) || !/^[0-9a-f-]{36}$/i.test(id)) {
      throw new BadRequestException('Invalid cursor');
    }
    return { createdAt, id };
  }
}
