import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ChatGeneralErrorCode, RoleName } from '@quantia/contracts';
import type { AuthenticatedUser } from '../common/interfaces/jwt-payload.interface';
import { ChatGeneralService } from './chat-general.service';
import type {
  ChatGeneralRepository,
  GeneralChatMessageWithAuthor,
} from './chat-general.repository';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '33333333-3333-4333-8333-333333333333';
const MSG_ID = '22222222-2222-4222-8222-222222222222';

const user: AuthenticatedUser = {
  id: USER_ID,
  email: 'a@quantia.local',
  roles: [RoleName.INVESTIGADOR],
};
const admin: AuthenticatedUser = {
  id: OTHER_ID,
  email: 'admin@quantia.local',
  roles: [RoleName.ADMINISTRADOR],
};

const author = {
  id: USER_ID,
  fullName: 'Ana',
  isActive: true,
  avatar: 'AVATAR_01' as 'AVATAR_01' | null,
};

function row(
  overrides: Partial<GeneralChatMessageWithAuthor> = {},
): GeneralChatMessageWithAuthor {
  return {
    id: MSG_ID,
    seq: 7n,
    version: 1,
    authorId: USER_ID,
    content: 'hola',
    clientMessageId: null,
    replyToId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    editedAt: null,
    deletedAt: null,
    deletedById: null,
    author,
    replyTo: null,
    reactions: [],
    ...overrides,
  };
}

function codeOf(error: unknown): unknown {
  return (
    (error as { getResponse: () => { code?: string } }).getResponse() ?? {}
  ).code;
}

function buildService(overrides?: {
  repo?: Partial<Record<keyof ChatGeneralRepository, jest.Mock>>;
  config?: Record<string, unknown>;
  profile?: Partial<typeof author> | null;
}) {
  const profile =
    overrides && 'profile' in overrides
      ? overrides.profile === null
        ? null
        : { ...author, ...overrides.profile }
      : author;
  const repo = {
    findChatUser: jest.fn().mockResolvedValue(profile),
    create: jest.fn(),
    findBySenderAndClientMessageId: jest.fn().mockResolvedValue(null),
    findById: jest.fn(),
    findLiveById: jest.fn(),
    findHistory: jest.fn(),
    findUpdates: jest.fn(),
    updateContent: jest.fn(),
    softDelete: jest.fn(),
    setReaction: jest.fn(),
    removeReaction: jest.fn(),
    latestSeq: jest.fn().mockResolvedValue(10n),
    getLastReadSeq: jest.fn().mockResolvedValue(0n),
    advanceReadPointer: jest.fn(),
    countUnread: jest.fn().mockResolvedValue(0),
    listReadStates: jest.fn().mockResolvedValue([]),
    ...overrides?.repo,
  };
  const defaults: Record<string, unknown> = {
    CHAT_GENERAL_ENABLED: true,
    CHAT_GENERAL_MESSAGE_MAX_LENGTH: 2000,
    CHAT_GENERAL_HISTORY_DEFAULT_LIMIT: 30,
    CHAT_GENERAL_HISTORY_MAX_LIMIT: 100,
    CHAT_GENERAL_EDIT_WINDOW_SECONDS: 172_800,
    CHAT_GENERAL_TYPING_TTL_MS: 6000,
    ...overrides?.config,
  };
  const config = { get: jest.fn((key: string) => defaults[key]) };
  const realtime = {
    emitChatGeneralMensajeCreado: jest.fn().mockResolvedValue(undefined),
    emitChatGeneralMensajeEditado: jest.fn().mockResolvedValue(undefined),
    emitChatGeneralMensajeEliminado: jest.fn().mockResolvedValue(undefined),
    emitChatGeneralReaccionesActualizadas: jest
      .fn()
      .mockResolvedValue(undefined),
    emitChatGeneralLectura: jest.fn().mockResolvedValue(undefined),
  };
  const service = new ChatGeneralService(
    repo as never,
    config as never,
    realtime as never,
  );
  return { service, repo, realtime };
}

describe('ChatGeneralService', () => {
  describe('access gate', () => {
    it('404 CHAT_DISABLED when the flag is off', async () => {
      const { service } = buildService({
        config: { CHAT_GENERAL_ENABLED: false },
      });
      const err = await service
        .create(user, { content: 'hola' })
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(NotFoundException);
      expect(codeOf(err)).toBe(ChatGeneralErrorCode.CHAT_DISABLED);
    });

    it('403 AVATAR_REQUIRED until the user picks an avatar', async () => {
      const { service } = buildService({ profile: { avatar: null } });
      const err = await service.listHistory(user, {}).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ForbiddenException);
      expect(codeOf(err)).toBe(ChatGeneralErrorCode.AVATAR_REQUIRED);
    });

    it('403 for inactive users', async () => {
      const { service } = buildService({ profile: { isActive: false } });
      await expect(service.getState(user)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('create', () => {
    it('rejects content longer than env max', async () => {
      const { service } = buildService({
        config: { CHAT_GENERAL_MESSAGE_MAX_LENGTH: 5 },
      });
      await expect(
        service.create(user, { content: 'demasiado' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects content that is empty after sanitising', async () => {
      const { service } = buildService();
      await expect(
        service.create(user, { content: '\u0000\u202E\u0007' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('persists before emitting and returns the full DTO', async () => {
      const order: string[] = [];
      const { service, repo, realtime } = buildService();
      repo.create.mockImplementation(() => {
        order.push('persist');
        return Promise.resolve(row());
      });
      realtime.emitChatGeneralMensajeCreado.mockImplementation(() => {
        order.push('emit');
        return Promise.resolve();
      });

      const result = await service.create(user, { content: 'hola' });

      expect(order).toEqual(['persist', 'emit']);
      expect(result.created).toBe(true);
      expect(result.message).toMatchObject({
        id: MSG_ID,
        seq: 7,
        version: 1,
        content: 'hola',
        editedAt: null,
        deletedAt: null,
        replyTo: null,
        reactions: [],
        author: {
          id: USER_ID,
          name: 'Ana',
          avatar: 'AVATAR_01',
          avatarUrl: null,
        },
      });
      expect(JSON.stringify(result.message)).not.toContain(user.email);
      expect(realtime.emitChatGeneralMensajeCreado).toHaveBeenCalledWith({
        message: result.message,
      });
    });

    it('idempotent replay returns the existing message and re-emits it', async () => {
      const existing = row({ clientMessageId: 'c-1' });
      const { service, repo, realtime } = buildService({
        repo: {
          findBySenderAndClientMessageId: jest.fn().mockResolvedValue(existing),
        },
      });
      const result = await service.create(user, {
        content: 'hola',
        clientMessageId: 'c-1',
      });
      expect(result.created).toBe(false);
      expect(repo.create).not.toHaveBeenCalled();
      // Re-emit closes the gap when the first fan-out failed after persisting.
      expect(realtime.emitChatGeneralMensajeCreado).toHaveBeenCalledTimes(1);
    });

    it('replay of a deleted message does not resurrect it', async () => {
      const { service, realtime } = buildService({
        repo: {
          findBySenderAndClientMessageId: jest
            .fn()
            .mockResolvedValue(row({ deletedAt: new Date() })),
        },
      });
      const result = await service.create(user, {
        content: 'hola',
        clientMessageId: 'c-1',
      });
      expect(result.message.content).toBe('');
      expect(realtime.emitChatGeneralMensajeCreado).not.toHaveBeenCalled();
    });

    it('handles the P2002 race by returning the winner', async () => {
      const winner = row({ clientMessageId: 'c-1' });
      const { service } = buildService({
        repo: {
          findBySenderAndClientMessageId: jest
            .fn()
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(winner),
          create: jest.fn().mockRejectedValue(
            new Prisma.PrismaClientKnownRequestError('dup', {
              code: 'P2002',
              clientVersion: 'test',
            }),
          ),
        },
      });
      const result = await service.create(user, {
        content: 'hola',
        clientMessageId: 'c-1',
      });
      expect(result).toMatchObject({ created: false, message: { id: MSG_ID } });
    });

    it('rejects replies to missing or deleted messages', async () => {
      const { service } = buildService({
        repo: {
          findLiveById: jest
            .fn()
            .mockResolvedValue({ id: OTHER_ID, deletedAt: new Date() }),
        },
      });
      const err = await service
        .create(user, { content: 'hola', replyToId: OTHER_ID })
        .catch((e: unknown) => e);
      expect(codeOf(err)).toBe(ChatGeneralErrorCode.REPLY_TARGET_NOT_FOUND);
    });

    it('maps reply previews with a trimmed excerpt', async () => {
      const parentAuthor = { ...author, id: OTHER_ID, fullName: 'Beto' };
      const { service } = buildService({
        repo: {
          findLiveById: jest
            .fn()
            .mockResolvedValue({ id: OTHER_ID, deletedAt: null }),
          create: jest.fn().mockResolvedValue(
            row({
              replyToId: OTHER_ID,
              replyTo: {
                id: OTHER_ID,
                seq: 3n,
                content: `  ${'x'.repeat(200)}\n`,
                deletedAt: null,
                author: parentAuthor,
              },
            }),
          ),
        },
      });
      const { message } = await service.create(user, {
        content: 'respuesta',
        replyToId: OTHER_ID,
      });
      expect(message.replyTo).toMatchObject({
        id: OTHER_ID,
        seq: 3,
        deleted: false,
        author: { name: 'Beto' },
      });
      expect(message.replyTo?.excerpt).toHaveLength(120);
      expect(message.replyTo?.excerpt?.endsWith('…')).toBe(true);
    });
  });

  describe('edit', () => {
    it('only the author can edit', async () => {
      const { service } = buildService({
        repo: {
          findById: jest.fn().mockResolvedValue(row({ authorId: OTHER_ID })),
        },
      });
      const err = await service
        .edit(user, MSG_ID, { content: 'nuevo' })
        .catch((e: unknown) => e);
      expect(codeOf(err)).toBe(ChatGeneralErrorCode.NOT_MESSAGE_AUTHOR);
    });

    it('rejects edits after the window', async () => {
      const { service } = buildService({
        config: { CHAT_GENERAL_EDIT_WINDOW_SECONDS: 60 },
        repo: {
          findById: jest
            .fn()
            .mockResolvedValue(
              row({ createdAt: new Date(Date.now() - 61_000) }),
            ),
        },
      });
      const err = await service
        .edit(user, MSG_ID, { content: 'nuevo' })
        .catch((e: unknown) => e);
      expect(codeOf(err)).toBe(ChatGeneralErrorCode.EDIT_WINDOW_EXPIRED);
    });

    it('same content is a no-op (no version bump, no event)', async () => {
      const { service, repo, realtime } = buildService({
        repo: { findById: jest.fn().mockResolvedValue(row()) },
      });
      await service.edit(user, MSG_ID, { content: 'hola' });
      expect(repo.updateContent).not.toHaveBeenCalled();
      expect(realtime.emitChatGeneralMensajeEditado).not.toHaveBeenCalled();
    });

    it('updates and emits mensaje-editado with editedAt/version', async () => {
      const editedAt = new Date();
      const { service, realtime } = buildService({
        repo: {
          findById: jest.fn().mockResolvedValue(row()),
          updateContent: jest
            .fn()
            .mockResolvedValue(row({ content: 'nuevo', version: 2, editedAt })),
        },
      });
      const message = await service.edit(user, MSG_ID, { content: 'nuevo' });
      expect(message).toMatchObject({
        content: 'nuevo',
        version: 2,
        editedAt: editedAt.toISOString(),
      });
      expect(realtime.emitChatGeneralMensajeEditado).toHaveBeenCalledWith({
        message,
      });
    });

    it('404 on deleted messages', async () => {
      const { service } = buildService({
        repo: {
          findById: jest.fn().mockResolvedValue(row({ deletedAt: new Date() })),
        },
      });
      await expect(
        service.edit(user, MSG_ID, { content: 'x' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('remove', () => {
    it('author deletes and emits mensaje-eliminado', async () => {
      const deletedAt = new Date();
      const { service, repo, realtime } = buildService({
        repo: {
          findById: jest.fn().mockResolvedValue(row()),
          softDelete: jest
            .fn()
            .mockResolvedValue(row({ deletedAt, version: 2, content: '' })),
        },
      });
      await service.remove(user, MSG_ID);
      expect(repo.softDelete).toHaveBeenCalledWith(MSG_ID, USER_ID);
      expect(realtime.emitChatGeneralMensajeEliminado).toHaveBeenCalledWith({
        id: MSG_ID,
        seq: 7,
        version: 2,
        deletedAt: deletedAt.toISOString(),
        byModerator: false,
      });
    });

    it('admins can moderate others; flagged as byModerator', async () => {
      const { service, realtime } = buildService({
        repo: {
          findById: jest.fn().mockResolvedValue(row()),
          softDelete: jest
            .fn()
            .mockResolvedValue(row({ deletedAt: new Date(), version: 2 })),
        },
      });
      await service.remove(admin, MSG_ID);
      expect(realtime.emitChatGeneralMensajeEliminado).toHaveBeenCalledWith(
        expect.objectContaining({ byModerator: true }),
      );
    });

    it('non-authors cannot delete', async () => {
      const { service } = buildService({
        repo: {
          findById: jest.fn().mockResolvedValue(row({ authorId: OTHER_ID })),
        },
      });
      await expect(service.remove(user, MSG_ID)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('is idempotent on already-deleted messages', async () => {
      const { service, repo, realtime } = buildService({
        repo: {
          findById: jest.fn().mockResolvedValue(row({ deletedAt: new Date() })),
        },
      });
      await service.remove(user, MSG_ID);
      expect(repo.softDelete).not.toHaveBeenCalled();
      expect(realtime.emitChatGeneralMensajeEliminado).not.toHaveBeenCalled();
    });
  });

  describe('reactions', () => {
    it('sets a reaction and emits the aggregated summary', async () => {
      const { service, realtime } = buildService({
        repo: {
          findById: jest.fn().mockResolvedValue(row()),
          setReaction: jest.fn().mockResolvedValue(
            row({
              version: 2,
              reactions: [
                { userId: OTHER_ID, emoji: '🔥', createdAt: new Date() },
                { userId: USER_ID, emoji: '👍', createdAt: new Date() },
              ],
            }),
          ),
        },
      });
      const message = await service.setReaction(user, MSG_ID, '👍');
      // Allowlist order, not arrival order, so chips do not jump.
      expect(message.reactions).toEqual([
        { emoji: '👍', count: 1, userIds: [USER_ID] },
        { emoji: '🔥', count: 1, userIds: [OTHER_ID] },
      ]);
      expect(
        realtime.emitChatGeneralReaccionesActualizadas,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          messageId: MSG_ID,
          version: 2,
          actorId: USER_ID,
          emoji: '👍',
        }),
      );
    });

    it('same reaction again is a no-op', async () => {
      const { service, repo } = buildService({
        repo: {
          findById: jest.fn().mockResolvedValue(
            row({
              reactions: [
                { userId: USER_ID, emoji: '👍', createdAt: new Date() },
              ],
            }),
          ),
        },
      });
      await service.setReaction(user, MSG_ID, '👍');
      expect(repo.setReaction).not.toHaveBeenCalled();
    });

    it('clearing without a reaction is a no-op', async () => {
      const { service, repo, realtime } = buildService({
        repo: { findById: jest.fn().mockResolvedValue(row()) },
      });
      await service.clearReaction(user, MSG_ID);
      expect(repo.removeReaction).not.toHaveBeenCalled();
      expect(
        realtime.emitChatGeneralReaccionesActualizadas,
      ).not.toHaveBeenCalled();
    });
  });

  describe('read state', () => {
    it('clamps to latestSeq and emits lectura when it advances', async () => {
      const { service, repo, realtime } = buildService({
        repo: {
          advanceReadPointer: jest.fn().mockResolvedValue(10n),
          countUnread: jest.fn().mockResolvedValue(0),
        },
      });
      const result = await service.markRead(user, 999);
      expect(repo.advanceReadPointer).toHaveBeenCalledWith(USER_ID, 10n);
      expect(result).toEqual({ lastReadSeq: 10, unreadCount: 0 });
      expect(realtime.emitChatGeneralLectura).toHaveBeenCalledWith(
        expect.objectContaining({ userId: USER_ID, lastReadSeq: 10 }),
      );
    });

    it('does not emit when the pointer did not move', async () => {
      const { service, realtime } = buildService({
        repo: {
          advanceReadPointer: jest.fn().mockResolvedValue(null),
          getLastReadSeq: jest.fn().mockResolvedValue(8n),
          countUnread: jest.fn().mockResolvedValue(2),
        },
      });
      await expect(service.markRead(user, 5)).resolves.toEqual({
        lastReadSeq: 8,
        unreadCount: 2,
      });
      expect(realtime.emitChatGeneralLectura).not.toHaveBeenCalled();
    });

    it('state exposes limits and reactions for the client', async () => {
      const { service } = buildService({
        repo: {
          listReadStates: jest
            .fn()
            .mockResolvedValue([{ userId: OTHER_ID, lastReadSeq: 4n }]),
          countUnread: jest.fn().mockResolvedValue(3),
        },
      });
      const state = await service.getState(user);
      expect(state).toMatchObject({
        latestSeq: 10,
        lastReadSeq: 0,
        unreadCount: 3,
        readStates: [{ userId: OTHER_ID, lastReadSeq: 4 }],
        limits: {
          messageMaxLength: 2000,
          editWindowSeconds: 172_800,
          typingTtlMs: 6000,
          historyMaxLimit: 100,
        },
      });
      expect(state.reactions).toContain('👍');
    });
  });

  describe('history and updates', () => {
    it('paginates by seq with an opaque cursor', async () => {
      const rows = [
        row({ id: MSG_ID, seq: 9n }),
        row({ id: OTHER_ID, seq: 8n }),
        row({ seq: 7n }),
      ];
      const { service, repo } = buildService({
        repo: { findHistory: jest.fn().mockResolvedValue(rows) },
      });
      const page = await service.listHistory(user, { limit: 2 });
      expect(page.hasMore).toBe(true);
      expect(page.items.map((m) => m.seq)).toEqual([9, 8]);
      expect(service.decodeHistoryCursor(page.nextCursor!)).toBe(8n);

      await service.listHistory(user, { limit: 2, cursor: page.nextCursor! });
      expect(repo.findHistory).toHaveBeenLastCalledWith({
        limit: 3,
        beforeSeq: 8n,
      });
    });

    it('rejects malformed cursors with 400', async () => {
      const { service } = buildService();
      await expect(
        service.listHistory(user, { cursor: '%%%' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(() => service.decodeUpdatesCursor('bad')).toThrow(
        BadRequestException,
      );
    });

    it('updates feed requires since or cursor', async () => {
      const { service } = buildService();
      await expect(service.listUpdates(user, {})).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('updates feed returns tombstones and a serverTime', async () => {
      const tomb = row({ deletedAt: new Date(), content: 'secreto' });
      const { service } = buildService({
        repo: { findUpdates: jest.fn().mockResolvedValue([tomb]) },
      });
      const res = await service.listUpdates(user, {
        since: '2026-01-01T00:00:00.000Z',
      });
      expect(res.items[0]).toMatchObject({ content: '', reactions: [] });
      expect(res.items[0].deletedAt).not.toBeNull();
      expect(res.hasMore).toBe(false);
      expect(typeof res.serverTime).toBe('string');
    });

    it('round-trips the updates cursor', () => {
      const { service } = buildService();
      const at = new Date('2026-01-01T00:00:00.123Z');
      const cursor = service.encodeUpdatesCursor(at, MSG_ID);
      expect(service.decodeUpdatesCursor(cursor)).toEqual({
        updatedAt: at,
        id: MSG_ID,
      });
    });
  });
});
