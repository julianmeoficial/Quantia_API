import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import {
  CHAT_GENERAL_REACTIONS,
  CHAT_GENERAL_REPLY_EXCERPT_MAX,
  RoleName,
  type ChatGeneralReaction,
  type GeneralChatHistoryResponse,
  type GeneralChatMessageDto,
  type GeneralChatReactionSummary,
  type GeneralChatStateResponse,
  type GeneralChatUpdatesResponse,
  type MarkGeneralChatReadResponse,
  type PresenceUser,
} from '@quantia/contracts';
import type { AuthenticatedUser } from '../common/interfaces/jwt-payload.interface';
import type { EnvConfig } from '../config/env.schema';
import { RealtimeEmitter } from '../realtime/realtime-emitter.service';
import { ChatErrors } from './chat-general.errors';
import {
  ChatGeneralRepository,
  type ChatUserProfile,
  type GeneralChatMessageWithAuthor,
} from './chat-general.repository';
import type {
  CreateGeneralChatMessageDto,
  EditGeneralChatMessageDto,
  ListGeneralChatMessagesQueryDto,
  ListGeneralChatUpdatesQueryDto,
} from './dto/chat-general.dto';
import { sanitizeChatContent } from './sanitize-chat-content';

type Author = Pick<ChatUserProfile, 'id' | 'fullName' | 'avatar'>;

@Injectable()
export class ChatGeneralService {
  constructor(
    private readonly repo: ChatGeneralRepository,
    private readonly config: ConfigService<EnvConfig, true>,
    private readonly realtime: RealtimeEmitter,
  ) {}

  assertEnabled(): void {
    if (!this.config.get('CHAT_GENERAL_ENABLED', { infer: true })) {
      throw ChatErrors.disabled();
    }
  }

  /** Flag on + active user + avatar chosen. Every chat endpoint goes through here. */
  async requireChatUser(user: AuthenticatedUser): Promise<ChatUserProfile> {
    this.assertEnabled();
    const profile = await this.repo.findChatUser(user.id);
    if (!profile || !profile.isActive) {
      throw ChatErrors.unauthorized();
    }
    if (!profile.avatar) {
      throw ChatErrors.avatarRequired();
    }
    return profile;
  }

  // ---------------------------------------------------------------- create

  async create(
    user: AuthenticatedUser,
    dto: CreateGeneralChatMessageDto,
  ): Promise<{ message: GeneralChatMessageDto; created: boolean }> {
    await this.requireChatUser(user);
    const content = this.validContent(dto.content);

    if (dto.clientMessageId) {
      const existing = await this.repo.findBySenderAndClientMessageId(
        user.id,
        dto.clientMessageId,
      );
      if (existing) return this.replay(existing);
    }

    if (dto.replyToId) {
      const target = await this.repo.findLiveById(dto.replyToId);
      if (!target || target.deletedAt) {
        throw ChatErrors.replyTargetNotFound();
      }
    }

    try {
      const row = await this.repo.create({
        authorId: user.id,
        content,
        clientMessageId: dto.clientMessageId,
        replyToId: dto.replyToId,
      });
      const message = this.toMessageDto(row);
      // Persist first, then fan out (subscribers never see unsaved messages).
      await this.realtime.emitChatGeneralMensajeCreado({ message });
      return { message, created: true };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        dto.clientMessageId
      ) {
        // Concurrent retry with the same clientMessageId won the insert.
        const existing = await this.repo.findBySenderAndClientMessageId(
          user.id,
          dto.clientMessageId,
        );
        if (existing) return this.replay(existing);
      }
      throw error;
    }
  }

  /**
   * Idempotent replay. Re-emits `mensaje-creado` so a message whose first
   * fan-out failed (persisted, Redis down) still reaches other clients.
   * Clients dedupe by `id`, so a duplicate event is harmless.
   */
  private async replay(
    row: GeneralChatMessageWithAuthor,
  ): Promise<{ message: GeneralChatMessageDto; created: boolean }> {
    const message = this.toMessageDto(row);
    if (!row.deletedAt) {
      await this.realtime.emitChatGeneralMensajeCreado({ message });
    }
    return { message, created: false };
  }

  // ---------------------------------------------------------------- edit

  async edit(
    user: AuthenticatedUser,
    messageId: string,
    dto: EditGeneralChatMessageDto,
  ): Promise<GeneralChatMessageDto> {
    await this.requireChatUser(user);
    const content = this.validContent(dto.content);
    const row = await this.loadLive(messageId);

    if (row.authorId !== user.id) throw ChatErrors.notAuthor();
    const windowSeconds = this.config.get('CHAT_GENERAL_EDIT_WINDOW_SECONDS', {
      infer: true,
    });
    if (
      windowSeconds > 0 &&
      Date.now() - row.createdAt.getTime() > windowSeconds * 1000
    ) {
      throw ChatErrors.editWindowExpired();
    }
    if (row.content === content) {
      return this.toMessageDto(row); // no-op: no version bump, no event
    }

    const updated = await this.repo.updateContent(messageId, content);
    const message = this.toMessageDto(updated);
    await this.realtime.emitChatGeneralMensajeEditado({ message });
    return message;
  }

  // ---------------------------------------------------------------- delete

  /** Author any time; ADMINISTRADOR can moderate anyone's message. Idempotent. */
  async remove(user: AuthenticatedUser, messageId: string): Promise<void> {
    await this.requireChatUser(user);
    const row = await this.repo.findById(messageId);
    if (!row) throw ChatErrors.messageNotFound();
    if (row.deletedAt) return;

    const isAuthor = row.authorId === user.id;
    const isAdmin = user.roles.includes(RoleName.ADMINISTRADOR);
    if (!isAuthor && !isAdmin) throw ChatErrors.notAuthor();

    const deleted = await this.repo.softDelete(messageId, user.id);
    await this.realtime.emitChatGeneralMensajeEliminado({
      id: deleted.id,
      seq: Number(deleted.seq),
      version: deleted.version,
      deletedAt: (deleted.deletedAt ?? new Date()).toISOString(),
      byModerator: !isAuthor,
    });
  }

  // ---------------------------------------------------------------- reactions

  async setReaction(
    user: AuthenticatedUser,
    messageId: string,
    emoji: ChatGeneralReaction,
  ): Promise<GeneralChatMessageDto> {
    await this.requireChatUser(user);
    const row = await this.loadLive(messageId);
    const mine = row.reactions.find((r) => r.userId === user.id);
    if (mine?.emoji === emoji) return this.toMessageDto(row);

    const updated = await this.repo.setReaction(messageId, user.id, emoji);
    return this.emitReactions(updated, user.id, emoji);
  }

  async clearReaction(
    user: AuthenticatedUser,
    messageId: string,
  ): Promise<GeneralChatMessageDto> {
    await this.requireChatUser(user);
    const row = await this.loadLive(messageId);
    if (!row.reactions.some((r) => r.userId === user.id)) {
      return this.toMessageDto(row);
    }
    const updated = await this.repo.removeReaction(messageId, user.id);
    return this.emitReactions(updated, user.id, null);
  }

  private async emitReactions(
    row: GeneralChatMessageWithAuthor,
    actorId: string,
    emoji: ChatGeneralReaction | null,
  ): Promise<GeneralChatMessageDto> {
    const message = this.toMessageDto(row);
    await this.realtime.emitChatGeneralReaccionesActualizadas({
      messageId: message.id,
      seq: message.seq,
      version: message.version,
      reactions: message.reactions,
      actorId,
      emoji,
    });
    return message;
  }

  // ---------------------------------------------------------------- read state

  async markRead(
    user: AuthenticatedUser,
    lastReadSeq: number,
  ): Promise<MarkGeneralChatReadResponse> {
    await this.requireChatUser(user);
    const latest = await this.repo.latestSeq();
    // Never point past the newest message (clients cannot pre-read the future).
    const target = BigInt(lastReadSeq) > latest ? latest : BigInt(lastReadSeq);
    const advanced = await this.repo.advanceReadPointer(user.id, target);
    const pointer = advanced ?? (await this.repo.getLastReadSeq(user.id));
    if (advanced !== null) {
      await this.realtime.emitChatGeneralLectura({
        userId: user.id,
        lastReadSeq: Number(advanced),
        readAt: new Date().toISOString(),
      });
    }
    return {
      lastReadSeq: Number(pointer),
      unreadCount: await this.repo.countUnread(user.id, pointer),
    };
  }

  async getState(user: AuthenticatedUser): Promise<GeneralChatStateResponse> {
    await this.requireChatUser(user);
    const [latest, lastRead, readStates] = await Promise.all([
      this.repo.latestSeq(),
      this.repo.getLastReadSeq(user.id),
      this.repo.listReadStates(),
    ]);
    return {
      serverTime: new Date().toISOString(),
      latestSeq: Number(latest),
      lastReadSeq: Number(lastRead),
      unreadCount: await this.repo.countUnread(user.id, lastRead),
      readStates: readStates.map((r) => ({
        userId: r.userId,
        lastReadSeq: Number(r.lastReadSeq),
      })),
      limits: {
        messageMaxLength: this.config.get('CHAT_GENERAL_MESSAGE_MAX_LENGTH', {
          infer: true,
        }),
        editWindowSeconds: this.config.get('CHAT_GENERAL_EDIT_WINDOW_SECONDS', {
          infer: true,
        }),
        typingTtlMs: this.config.get('CHAT_GENERAL_TYPING_TTL_MS', {
          infer: true,
        }),
        historyMaxLimit: this.config.get('CHAT_GENERAL_HISTORY_MAX_LIMIT', {
          infer: true,
        }),
      },
      reactions: [...CHAT_GENERAL_REACTIONS],
    };
  }

  // ---------------------------------------------------------------- reads

  async listHistory(
    user: AuthenticatedUser,
    query: ListGeneralChatMessagesQueryDto,
  ): Promise<GeneralChatHistoryResponse> {
    await this.requireChatUser(user);
    const limit = this.clampLimit(query.limit);
    const beforeSeq = query.cursor
      ? this.decodeHistoryCursor(query.cursor)
      : undefined;

    const rows = await this.repo.findHistory({ limit: limit + 1, beforeSeq });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    return {
      items: page.map((row) => this.toMessageDto(row)),
      nextCursor: hasMore && last ? this.encodeHistoryCursor(last.seq) : null,
      hasMore,
    };
  }

  /** Reconnect / gap-fill: everything that changed after `since` (or `cursor`). */
  async listUpdates(
    user: AuthenticatedUser,
    query: ListGeneralChatUpdatesQueryDto,
  ): Promise<GeneralChatUpdatesResponse> {
    await this.requireChatUser(user);
    if (!query.since && !query.cursor) {
      throw ChatErrors.invalid('since or cursor is required');
    }
    const serverTime = new Date();
    const limit = this.clampLimit(query.limit);
    const cursor = query.cursor
      ? this.decodeUpdatesCursor(query.cursor)
      : undefined;
    const since = query.since ? new Date(query.since) : undefined;

    const rows = await this.repo.findUpdates({
      limit: limit + 1,
      since,
      cursorUpdatedAt: cursor?.updatedAt,
      cursorId: cursor?.id,
    });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    return {
      items: page.map((row) => this.toMessageDto(row)),
      nextCursor:
        hasMore && last
          ? this.encodeUpdatesCursor(last.updatedAt, last.id)
          : null,
      hasMore,
      serverTime: serverTime.toISOString(),
    };
  }

  // ---------------------------------------------------------------- mapping

  toPresenceUser(user: Author): PresenceUser {
    return {
      id: user.id,
      name: user.fullName,
      avatar: user.avatar,
      avatarUrl: null,
    };
  }

  toMessageDto(row: GeneralChatMessageWithAuthor): GeneralChatMessageDto {
    const deleted = row.deletedAt !== null;
    const parent = row.replyTo;
    return {
      id: row.id,
      seq: Number(row.seq),
      version: row.version,
      content: deleted ? '' : row.content,
      clientMessageId: row.clientMessageId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      editedAt: row.editedAt ? row.editedAt.toISOString() : null,
      deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
      author: this.toPresenceUser(row.author),
      replyTo:
        !deleted && parent
          ? {
              id: parent.id,
              seq: Number(parent.seq),
              author: this.toPresenceUser(parent.author),
              excerpt: parent.deletedAt ? null : this.excerpt(parent.content),
              deleted: parent.deletedAt !== null,
            }
          : null,
      reactions: deleted ? [] : this.summarizeReactions(row.reactions),
    };
  }

  private summarizeReactions(
    reactions: GeneralChatMessageWithAuthor['reactions'],
  ): GeneralChatReactionSummary[] {
    const byEmoji = new Map<string, string[]>();
    for (const r of reactions) {
      const list = byEmoji.get(r.emoji) ?? [];
      list.push(r.userId);
      byEmoji.set(r.emoji, list);
    }
    // Stable order = allowlist order, so chips never jump around.
    return CHAT_GENERAL_REACTIONS.filter((e) => byEmoji.has(e)).map((emoji) => {
      const userIds = byEmoji.get(emoji) ?? [];
      return { emoji, count: userIds.length, userIds };
    });
  }

  private excerpt(content: string): string {
    const flat = content.replace(/\s+/g, ' ').trim();
    return flat.length > CHAT_GENERAL_REPLY_EXCERPT_MAX
      ? `${flat.slice(0, CHAT_GENERAL_REPLY_EXCERPT_MAX - 1)}…`
      : flat;
  }

  // ---------------------------------------------------------------- helpers

  private validContent(raw: string): string {
    const content = sanitizeChatContent(raw);
    const maxLen = this.config.get('CHAT_GENERAL_MESSAGE_MAX_LENGTH', {
      infer: true,
    });
    if (content.length === 0) {
      throw ChatErrors.invalid('content must not be empty');
    }
    if (content.length > maxLen) {
      throw ChatErrors.invalid(`content must be at most ${maxLen} characters`);
    }
    return content;
  }

  private async loadLive(
    messageId: string,
  ): Promise<GeneralChatMessageWithAuthor> {
    const row = await this.repo.findById(messageId);
    if (!row || row.deletedAt) throw ChatErrors.messageNotFound();
    return row;
  }

  private clampLimit(requested?: number): number {
    const def = this.config.get('CHAT_GENERAL_HISTORY_DEFAULT_LIMIT', {
      infer: true,
    });
    const max = this.config.get('CHAT_GENERAL_HISTORY_MAX_LIMIT', {
      infer: true,
    });
    return Math.min(requested ?? def, max);
  }

  encodeHistoryCursor(seq: bigint): string {
    return Buffer.from(`s:${seq.toString()}`, 'utf8').toString('base64url');
  }

  decodeHistoryCursor(cursor: string): bigint {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const match = /^s:(\d{1,19})$/.exec(raw);
    if (!match) throw ChatErrors.invalid('Invalid cursor');
    return BigInt(match[1]);
  }

  encodeUpdatesCursor(updatedAt: Date, id: string): string {
    return Buffer.from(`u:${updatedAt.toISOString()}|${id}`, 'utf8').toString(
      'base64url',
    );
  }

  decodeUpdatesCursor(cursor: string): { updatedAt: Date; id: string } {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const match = /^u:(.+)\|([0-9a-f-]{36})$/i.exec(raw);
    const updatedAt = match ? new Date(match[1]) : new Date(NaN);
    if (!match || Number.isNaN(updatedAt.getTime())) {
      throw ChatErrors.invalid('Invalid cursor');
    }
    return { updatedAt, id: match[2] };
  }
}
