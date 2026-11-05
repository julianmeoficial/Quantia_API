import { Injectable } from '@nestjs/common';
import { Prisma, type AvatarKey } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

const authorSelect = {
  id: true,
  fullName: true,
  isActive: true,
  avatar: true,
} satisfies Prisma.UserSelect;

/** Everything a message DTO needs, in one round-trip (no N+1). */
export const messageInclude = {
  author: { select: authorSelect },
  replyTo: {
    select: {
      id: true,
      seq: true,
      content: true,
      deletedAt: true,
      author: { select: authorSelect },
    },
  },
  reactions: {
    select: { userId: true, emoji: true, createdAt: true },
    orderBy: [{ createdAt: 'asc' }, { userId: 'asc' }],
  },
} satisfies Prisma.GeneralChatMessageInclude;

export type GeneralChatMessageWithAuthor = Prisma.GeneralChatMessageGetPayload<{
  include: typeof messageInclude;
}>;

export type ChatUserProfile = {
  id: string;
  fullName: string;
  isActive: boolean;
  avatar: AvatarKey | null;
};

@Injectable()
export class ChatGeneralRepository {
  constructor(private readonly prisma: PrismaService) {}

  findChatUser(id: string): Promise<ChatUserProfile | null> {
    return this.prisma.user.findUnique({
      where: { id },
      select: authorSelect,
    });
  }

  create(data: {
    authorId: string;
    content: string;
    clientMessageId?: string;
    replyToId?: string;
  }): Promise<GeneralChatMessageWithAuthor> {
    return this.prisma.generalChatMessage.create({
      data: {
        authorId: data.authorId,
        content: data.content,
        clientMessageId: data.clientMessageId,
        replyToId: data.replyToId,
      },
      include: messageInclude,
    });
  }

  /** Includes tombstones so an idempotent replay never resurrects a deleted message. */
  findBySenderAndClientMessageId(
    authorId: string,
    clientMessageId: string,
  ): Promise<GeneralChatMessageWithAuthor | null> {
    return this.prisma.generalChatMessage.findFirst({
      where: { authorId, clientMessageId },
      include: messageInclude,
    });
  }

  findById(id: string): Promise<GeneralChatMessageWithAuthor | null> {
    return this.prisma.generalChatMessage.findUnique({
      where: { id },
      include: messageInclude,
    });
  }

  findLiveById(
    id: string,
  ): Promise<{ id: string; deletedAt: Date | null } | null> {
    return this.prisma.generalChatMessage.findUnique({
      where: { id },
      select: { id: true, deletedAt: true },
    });
  }

  /** Newest first; deleted messages excluded. */
  findHistory(params: {
    limit: number;
    beforeSeq?: bigint;
  }): Promise<GeneralChatMessageWithAuthor[]> {
    return this.prisma.generalChatMessage.findMany({
      where: {
        deletedAt: null,
        ...(params.beforeSeq !== undefined
          ? { seq: { lt: params.beforeSeq } }
          : {}),
      },
      take: params.limit,
      orderBy: { seq: 'desc' },
      include: messageInclude,
    });
  }

  /** Change feed: oldest change first, tombstones included. */
  findUpdates(params: {
    limit: number;
    since?: Date;
    cursorUpdatedAt?: Date;
    cursorId?: string;
  }): Promise<GeneralChatMessageWithAuthor[]> {
    let where: Prisma.GeneralChatMessageWhereInput = {};
    if (params.cursorUpdatedAt && params.cursorId) {
      where = {
        OR: [
          { updatedAt: { gt: params.cursorUpdatedAt } },
          { updatedAt: params.cursorUpdatedAt, id: { gt: params.cursorId } },
        ],
      };
    } else if (params.since) {
      where = { updatedAt: { gt: params.since } };
    }
    return this.prisma.generalChatMessage.findMany({
      where,
      take: params.limit,
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      include: messageInclude,
    });
  }

  updateContent(
    id: string,
    content: string,
  ): Promise<GeneralChatMessageWithAuthor> {
    return this.prisma.generalChatMessage.update({
      where: { id },
      data: { content, editedAt: new Date(), version: { increment: 1 } },
      include: messageInclude,
    });
  }

  /** Soft delete: wipes content and reactions, keeps the row as a tombstone. */
  softDelete(
    id: string,
    deletedById: string,
  ): Promise<GeneralChatMessageWithAuthor> {
    return this.prisma.$transaction(async (tx) => {
      await tx.generalChatReaction.deleteMany({ where: { messageId: id } });
      return tx.generalChatMessage.update({
        where: { id },
        data: {
          content: '',
          deletedAt: new Date(),
          deletedById,
          version: { increment: 1 },
        },
        include: messageInclude,
      });
    });
  }

  setReaction(
    messageId: string,
    userId: string,
    emoji: string,
  ): Promise<GeneralChatMessageWithAuthor> {
    return this.prisma.$transaction(async (tx) => {
      await tx.generalChatReaction.upsert({
        where: { messageId_userId: { messageId, userId } },
        create: { messageId, userId, emoji },
        update: { emoji, createdAt: new Date() },
      });
      return tx.generalChatMessage.update({
        where: { id: messageId },
        data: { version: { increment: 1 } },
        include: messageInclude,
      });
    });
  }

  removeReaction(
    messageId: string,
    userId: string,
  ): Promise<GeneralChatMessageWithAuthor> {
    return this.prisma.$transaction(async (tx) => {
      await tx.generalChatReaction.deleteMany({ where: { messageId, userId } });
      return tx.generalChatMessage.update({
        where: { id: messageId },
        data: { version: { increment: 1 } },
        include: messageInclude,
      });
    });
  }

  async latestSeq(): Promise<bigint> {
    const agg = await this.prisma.generalChatMessage.aggregate({
      _max: { seq: true },
      where: { deletedAt: null },
    });
    return agg._max.seq ?? 0n;
  }

  async getLastReadSeq(userId: string): Promise<bigint> {
    const row = await this.prisma.generalChatReadState.findUnique({
      where: { userId },
      select: { lastReadSeq: true },
    });
    return row?.lastReadSeq ?? 0n;
  }

  /**
   * Monotonic upsert: only moves the pointer forward.
   * Returns the new value when it changed, `null` otherwise.
   */
  async advanceReadPointer(
    userId: string,
    lastReadSeq: bigint,
  ): Promise<bigint | null> {
    const rows = await this.prisma.$queryRaw<{ last_read_seq: bigint }[]>`
      INSERT INTO "general_chat_read_states" ("user_id", "last_read_seq", "updated_at")
      VALUES (${userId}::uuid, ${lastReadSeq}, NOW())
      ON CONFLICT ("user_id") DO UPDATE
        SET "last_read_seq" = EXCLUDED."last_read_seq", "updated_at" = NOW()
        WHERE "general_chat_read_states"."last_read_seq" < EXCLUDED."last_read_seq"
      RETURNING "last_read_seq"`;
    return rows[0]?.last_read_seq ?? null;
  }

  /** Unread = live messages from others after the pointer. */
  countUnread(userId: string, afterSeq: bigint): Promise<number> {
    return this.prisma.generalChatMessage.count({
      where: {
        deletedAt: null,
        seq: { gt: afterSeq },
        authorId: { not: userId },
      },
    });
  }

  listReadStates(): Promise<{ userId: string; lastReadSeq: bigint }[]> {
    return this.prisma.generalChatReadState.findMany({
      where: { user: { isActive: true } },
      select: { userId: true, lastReadSeq: true },
      orderBy: { userId: 'asc' },
    });
  }
}
