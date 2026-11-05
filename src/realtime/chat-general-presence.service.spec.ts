import { ChatGeneralPresenceService } from './chat-general-presence.service';

describe('ChatGeneralPresenceService', () => {
  const userId = '11111111-1111-4111-8111-111111111111';

  function build(overrides?: {
    scardSequence?: number[];
    leaveResults?: number[];
    lockResult?: string | null;
    staleUserIds?: string[];
    socketMembers?: string[];
    socketExists?: number;
    typingResults?: number[];
  }) {
    const typingResults = overrides?.typingResults ?? [1];
    let typingIdx = 0;
    const scardSequence = overrides?.scardSequence ?? [1];
    const leaveResults = overrides?.leaveResults ?? [1];
    let scardIdx = 0;
    let leaveIdx = 0;

    const pipeline = {
      expire: jest.fn().mockReturnThis(),
      zadd: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([]),
    };

    const client = {
      defineCommand: jest.fn(),
      chatGeneralJoin: jest.fn().mockImplementation(() => {
        return scardSequence[Math.min(scardIdx++, scardSequence.length - 1)];
      }),
      chatGeneralLeave: jest.fn().mockImplementation(() => {
        return leaveResults[Math.min(leaveIdx++, leaveResults.length - 1)];
      }),
      chatGeneralTyping: jest.fn().mockImplementation(() => {
        return typingResults[Math.min(typingIdx++, typingResults.length - 1)];
      }),
      zremrangebyscore: jest.fn().mockResolvedValue(0),
      zrange: jest.fn().mockResolvedValue([]),
      zrangebyscore: jest.fn().mockResolvedValue(overrides?.staleUserIds ?? []),
      smembers: jest.fn().mockResolvedValue(overrides?.socketMembers ?? []),
      exists: jest.fn().mockResolvedValue(overrides?.socketExists ?? 0),
      zrem: jest.fn().mockResolvedValue(1),
      set: jest
        .fn()
        .mockResolvedValue(
          Object.prototype.hasOwnProperty.call(overrides ?? {}, 'lockResult')
            ? overrides!.lockResult
            : 'OK',
        ),
      del: jest.fn().mockResolvedValue(1),
      pipeline: jest.fn().mockReturnValue(pipeline),
    };

    const redis = {
      connect: jest.fn().mockResolvedValue(undefined),
      getClient: () => client,
    };
    const config = {
      get: jest.fn((key: string) => {
        const map: Record<string, unknown> = {
          CHAT_GENERAL_ENABLED: true,
          CHAT_GENERAL_PRESENCE_TTL_SECONDS: 60,
          CHAT_GENERAL_HEARTBEAT_SECONDS: 20,
          CHAT_GENERAL_ROOM: 'general',
          CHAT_GENERAL_TYPING_TTL_MS: 6000,
        };
        return map[key];
      }),
    };
    const prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: userId,
          fullName: 'Ana',
          avatar: 'AVATAR_02',
        }),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const realtime = {
      emitChatGeneralUsuarioConectado: jest.fn().mockResolvedValue(undefined),
      emitChatGeneralUsuarioDesconectado: jest
        .fn()
        .mockResolvedValue(undefined),
      emitChatGeneralEscribiendo: jest.fn().mockResolvedValue(undefined),
    };

    const service = new ChatGeneralPresenceService(
      redis as never,
      config as never,
      prisma as never,
      realtime as never,
    );

    return { service, client, pipeline, realtime, prisma };
  }

  it('emits usuario-conectado only on 0→1 socket transition', async () => {
    const { service, realtime } = build({ scardSequence: [1, 2] });

    await service.join(userId, 'sock-a');
    expect(realtime.emitChatGeneralUsuarioConectado).toHaveBeenCalledTimes(1);

    await service.join(userId, 'sock-b');
    expect(realtime.emitChatGeneralUsuarioConectado).toHaveBeenCalledTimes(1);
  });

  it('emits usuario-desconectado only when last socket leaves', async () => {
    const { service, realtime } = build({
      scardSequence: [1, 2],
      leaveResults: [0, 1],
    });

    await service.join(userId, 'sock-a');
    await service.join(userId, 'sock-b');

    await service.leave(userId, 'sock-a');
    expect(realtime.emitChatGeneralUsuarioDesconectado).not.toHaveBeenCalled();

    await service.leave(userId, 'sock-b');
    expect(realtime.emitChatGeneralUsuarioDesconectado).toHaveBeenCalledTimes(
      1,
    );
    expect(realtime.emitChatGeneralUsuarioDesconectado).toHaveBeenCalledWith(
      expect.objectContaining({ userId }),
    );
  });

  it('heartbeat renews socket TTL and refreshes ZSET score', async () => {
    const { service, pipeline, client } = build({ scardSequence: [1] });
    await service.join(userId, 'sock-a');

    await service.runMaintenanceTick();

    expect(client.pipeline).toHaveBeenCalled();
    expect(pipeline.expire).toHaveBeenCalledWith(
      expect.stringContaining('socket:sock-a'),
      60,
    );
    expect(pipeline.zadd).toHaveBeenCalledWith(
      expect.stringContaining(':users'),
      expect.any(Number),
      userId,
    );
    expect(pipeline.exec).toHaveBeenCalled();
  });

  it('reconcile leaves orphan sockets whose TTL key expired', async () => {
    const { service, client, realtime } = build({
      scardSequence: [1],
      leaveResults: [1],
      staleUserIds: [userId],
      socketMembers: ['orphan-sock'],
      socketExists: 0,
    });

    await service.runMaintenanceTick();

    expect(client.set).toHaveBeenCalledWith(
      expect.stringContaining('reconcile:lock'),
      '1',
      'PX',
      expect.any(Number),
      'NX',
    );
    expect(client.chatGeneralLeave).toHaveBeenCalled();
    expect(realtime.emitChatGeneralUsuarioDesconectado).toHaveBeenCalledWith(
      expect.objectContaining({ userId }),
    );
    expect(client.del).toHaveBeenCalledWith(
      expect.stringContaining('reconcile:lock'),
    );
  });

  it('reconcile skips work when lock is not acquired', async () => {
    const { service, client } = build({
      lockResult: null,
      staleUserIds: [userId],
      socketMembers: ['orphan-sock'],
    });

    await service.runMaintenanceTick();

    expect(client.zrangebyscore).not.toHaveBeenCalled();
    expect(client.chatGeneralLeave).not.toHaveBeenCalled();
  });

  it('reconcile removes stale user with empty socket set', async () => {
    const { service, client } = build({
      staleUserIds: [userId],
      socketMembers: [],
    });

    await service.runMaintenanceTick();

    expect(client.zrem).toHaveBeenCalledWith(
      expect.stringContaining(':users'),
      userId,
    );
    expect(client.chatGeneralLeave).not.toHaveBeenCalled();
  });

  it('usuario-conectado carries the chosen avatar', async () => {
    const { service, realtime } = build({ scardSequence: [1] });
    await service.join(userId, 'sock-a');
    expect(realtime.emitChatGeneralUsuarioConectado).toHaveBeenCalledWith(
      expect.objectContaining({
        user: { id: userId, name: 'Ana', avatar: 'AVATAR_02', avatarUrl: null },
      }),
    );
  });

  it('usuario-desconectado includes lastSeenAt and clears typing', async () => {
    const { service, realtime } = build({ leaveResults: [1] });
    await service.leave(userId, 'sock-a');
    const payload = (
      realtime.emitChatGeneralUsuarioDesconectado.mock.calls[0] as [
        { lastSeenAt: string; occurredAt: string },
      ]
    )[0];
    expect(payload.lastSeenAt).toBe(payload.occurredAt);
    expect(realtime.emitChatGeneralEscribiendo).toHaveBeenCalledWith(
      expect.objectContaining({ isTyping: false }),
    );
  });

  const card = {
    id: userId,
    name: 'Ana',
    avatar: 'AVATAR_02' as const,
    avatarUrl: null,
  };

  it('startTyping broadcasts on start and throttles refreshes', async () => {
    const { service, realtime, client } = build({ typingResults: [1, 0] });

    await expect(service.startTyping(card)).resolves.toBe(true);
    await expect(service.startTyping(card)).resolves.toBe(false);

    expect(client.chatGeneralTyping).toHaveBeenCalledWith(
      expect.stringContaining(':typing'),
      userId,
      expect.any(Number),
      6000,
      2000,
    );
    expect(realtime.emitChatGeneralEscribiendo).toHaveBeenCalledTimes(1);
    expect(realtime.emitChatGeneralEscribiendo).toHaveBeenCalledWith({
      user: card,
      isTyping: true,
      expiresInMs: 6000,
    });
  });

  it('stopTyping broadcasts only when the user was typing', async () => {
    const { service, realtime, client } = build();
    client.zrem.mockResolvedValueOnce(0);
    await expect(service.stopTyping(card)).resolves.toBe(false);
    expect(realtime.emitChatGeneralEscribiendo).not.toHaveBeenCalled();

    client.zrem.mockResolvedValueOnce(1);
    await expect(service.stopTyping(card)).resolves.toBe(true);
    expect(realtime.emitChatGeneralEscribiendo).toHaveBeenCalledWith({
      user: card,
      isTyping: false,
      expiresInMs: 0,
    });
  });

  it('presence snapshot includes typing users and token expiry', async () => {
    const { service, prisma, client } = build();
    client.zrange.mockResolvedValue([userId]);
    client.zrangebyscore.mockResolvedValue([userId]);
    prisma.user.findMany.mockResolvedValue([
      { id: userId, fullName: 'Ana', avatar: 'AVATAR_02' },
    ]);
    const snap = await service.buildPresenceSnapshot(
      '2026-01-01T00:15:00.000Z',
    );
    expect(snap.users).toEqual([card]);
    expect(snap.typing).toEqual([card]);
    expect(snap.tokenExpiresAt).toBe('2026-01-01T00:15:00.000Z');
  });

  it('reconcile prunes expired typing entries', async () => {
    const { service, client } = build();
    await service.runMaintenanceTick();
    expect(client.zremrangebyscore).toHaveBeenCalledWith(
      expect.stringContaining(':typing'),
      '-inf',
      expect.any(Number),
    );
  });
});
