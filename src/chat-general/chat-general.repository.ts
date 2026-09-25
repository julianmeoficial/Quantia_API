import { Injectable } from '@nestjs/common';
import { Prisma, type GeneralChatMessage, type User } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

export type GeneralChatMessageWithAuthor = GeneralChatMessage & {
  author: Pick<User, 'id' | 'fullName' | 'isActive'>;
};

@Injectable()
export class ChatGeneralRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: {
    authorId: string;
    content: string;
    clientMessageId?: string;
  }): Promise<GeneralChatMessageWithAuthor> {
    return this.prisma.generalChatMessage.create({
      data: {
        authorId: data.authorId,
        content: data.content,
        clientMessageId: data.clientMessageId,
      },
      include: {
        author: { select: { id: true, fullName: true, isActive: true } },
      },
    });
  }

  findBySenderAndClientMessageId(
    authorId: string,
    clientMessageId: string,
  ): Promise<GeneralChatMessageWithAuthor | null> {
    return this.prisma.generalChatMessage.findFirst({
      where: { authorId, clientMessageId, deletedAt: null },
      include: {
        author: { select: { id: true, fullName: true, isActive: true } },
      },
    });
  }

  async findHistory(params: {
    limit: number;
    cursorCreatedAt?: Date;
    cursorId?: string;
  }): Promise<GeneralChatMessageWithAuthor[]> {
    const where: Prisma.GeneralChatMessageWhereInput = {
      deletedAt: null,
    };

    if (params.cursorCreatedAt && params.cursorId) {
      where.OR = [
        { createdAt: { lt: params.cursorCreatedAt } },
        {
          createdAt: params.cursorCreatedAt,
          id: { lt: params.cursorId },
        },
      ];
    }

    return this.prisma.generalChatMessage.findMany({
      where,
      take: params.limit,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: {
        author: { select: { id: true, fullName: true, isActive: true } },
      },
    });
  }

  findActiveUsersByIds(
    ids: string[],
  ): Promise<Array<Pick<User, 'id' | 'fullName'>>> {
    if (ids.length === 0) return Promise.resolve([]);
    return this.prisma.user.findMany({
      where: { id: { in: ids }, isActive: true },
      select: { id: true, fullName: true },
    });
  }
}
