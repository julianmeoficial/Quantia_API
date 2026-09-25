import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../common/interfaces/jwt-payload.interface';
import { ChatGeneralService } from './chat-general.service';
import type { ChatGeneralRepository } from './chat-general.repository';

describe('ChatGeneralService', () => {
  const user: AuthenticatedUser = {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'a@quantia.local',
    roles: [],
  };

  const author = {
    id: user.id,
    fullName: 'Ana',
    isActive: true,
  };

  function buildService(overrides?: {
    repo?: Partial<ChatGeneralRepository>;
    config?: Record<string, unknown>;
  }) {
    const repo = {
      create: jest.fn(),
      findBySenderAndClientMessageId: jest.fn(),
      findHistory: jest.fn(),
      findActiveUsersByIds: jest.fn(),
      ...overrides?.repo,
    };
    const defaults: Record<string, unknown> = {
      CHAT_GENERAL_ENABLED: true,
      CHAT_GENERAL_MESSAGE_MAX_LENGTH: 2000,
      CHAT_GENERAL_HISTORY_DEFAULT_LIMIT: 30,
      CHAT_GENERAL_HISTORY_MAX_LIMIT: 100,
      ...overrides?.config,
    };
    const config = {
      get: jest.fn((key: string) => defaults[key]),
    };
    const realtime = {
      emitChatGeneralMensajeCreado: jest.fn().mockResolvedValue(undefined),
    };
    const service = new ChatGeneralService(
      repo as never,
      config as never,
      realtime as never,
    );
    return { service, repo, realtime, config };
  }

  it('throws NotFound when chat is disabled', async () => {
    const { service } = buildService({
      config: { CHAT_GENERAL_ENABLED: false },
    });
    await expect(
      service.create(user, { content: 'hola' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects content longer than env max', async () => {
    const { service } = buildService({
      config: { CHAT_GENERAL_MESSAGE_MAX_LENGTH: 5 },
    });
    await expect(
      service.create(user, { content: 'demasiado' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates message and emits realtime event', async () => {
    const row = {
      id: '22222222-2222-4222-8222-222222222222',
      authorId: user.id,
      content: 'hola',
      clientMessageId: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      deletedAt: null,
      author,
    };
    const callOrder: string[] = [];
    const { service, repo, realtime } = buildService({
      repo: {
        create: jest.fn().mockImplementation(() => {
          callOrder.push('persist');
          return Promise.resolve(row);
        }),
      },
    });
    realtime.emitChatGeneralMensajeCreado.mockImplementation(() => {
      callOrder.push('emit');
      return Promise.resolve();
    });

    const result = await service.create(user, { content: 'hola' });

    expect(result.created).toBe(true);
    expect(result.message.content).toBe('hola');
    expect(result.message.author).toEqual({
      id: user.id,
      name: 'Ana',
      avatarUrl: null,
    });
    expect(result.message).not.toHaveProperty('email');
    expect(JSON.stringify(result.message)).not.toContain(user.email);
    expect(realtime.emitChatGeneralMensajeCreado).toHaveBeenCalledWith({
      message: result.message,
    });
    expect(repo.create).toHaveBeenCalled();
    expect(callOrder).toEqual(['persist', 'emit']);
  });

  it('returns existing message on P2002 without re-emitting', async () => {
    const existing = {
      id: '33333333-3333-4333-8333-333333333333',
      authorId: user.id,
      content: 'hola',
      clientMessageId: 'client-1',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      deletedAt: null,
      author,
    };
    const { service, realtime } = buildService({
      repo: {
        create: jest.fn().mockRejectedValue(
          new Prisma.PrismaClientKnownRequestError('Unique', {
            code: 'P2002',
            clientVersion: 'test',
          }),
        ),
        findBySenderAndClientMessageId: jest.fn().mockResolvedValue(existing),
      },
    });

    const result = await service.create(user, {
      content: 'hola',
      clientMessageId: 'client-1',
    });

    expect(result.created).toBe(false);
    expect(result.message.id).toBe(existing.id);
    expect(realtime.emitChatGeneralMensajeCreado).not.toHaveBeenCalled();
  });

  it('paginates history with cursor', async () => {
    const older = {
      id: '44444444-4444-4444-8444-444444444444',
      authorId: user.id,
      content: 'old',
      clientMessageId: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      deletedAt: null,
      author,
    };
    const newer = {
      id: '55555555-5555-4555-8555-555555555555',
      authorId: user.id,
      content: 'new',
      clientMessageId: null,
      createdAt: new Date('2026-01-02T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      deletedAt: null,
      author,
    };
    const { service, repo } = buildService({
      repo: {
        findHistory: jest.fn().mockResolvedValue([newer, older]),
      },
      config: {
        CHAT_GENERAL_HISTORY_DEFAULT_LIMIT: 1,
        CHAT_GENERAL_HISTORY_MAX_LIMIT: 100,
      },
    });

    const page = await service.listHistory({});
    expect(page.items).toHaveLength(1);
    expect(page.items[0].content).toBe('new');
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).toBeTruthy();
    expect(repo.findHistory).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 2 }),
    );

    const page2 = await service.listHistory({ cursor: page.nextCursor! });
    expect(repo.findHistory).toHaveBeenLastCalledWith(
      expect.objectContaining({
        cursorId: newer.id,
        cursorCreatedAt: newer.createdAt,
      }),
    );
    void page2;
  });

  it('rejects invalid cursor', () => {
    const { service } = buildService();
    expect(() => service.decodeCursor('not-valid')).toThrow(
      BadRequestException,
    );
  });
});
