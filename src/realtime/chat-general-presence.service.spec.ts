import { ChatGeneralPresenceService } from './chat-general-presence.service';

describe('ChatGeneralPresenceService', () => {
  function build(overrides?: {
    scardSequence?: number[];
    leaveResults?: number[];
  }) {
    const scardSequence = overrides?.scardSequence ?? [1];
    const leaveResults = overrides?.leaveResults ?? [1];
    let scardIdx = 0;
    let leaveIdx = 0;

    const client = {
      defineCommand: jest.fn(),
      chatGeneralJoin: jest.fn().mockImplementation(() => {
        return scardSequence[Math.min(scardIdx++, scardSequence.length - 1)];
      }),
      chatGeneralLeave: jest.fn().mockImplementation(() => {
        return leaveResults[Math.min(leaveIdx++, leaveResults.length - 1)];
      }),
      zrange: jest.fn().mockResolvedValue([]),
      zrangebyscore: jest.fn().mockResolvedValue([]),
      smembers: jest.fn().mockResolvedValue([]),
      exists: jest.fn().mockResolvedValue(0),
      zrem: jest.fn().mockResolvedValue(1),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
      pipeline: jest.fn().mockReturnValue({
        expire: jest.fn().mockReturnThis(),
        zadd: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      }),
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
        };
        return map[key];
      }),
    };
    const prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: '11111111-1111-4111-8111-111111111111',
          fullName: 'Ana',
        }),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const realtime = {
      emitChatGeneralUsuarioConectado: jest.fn().mockResolvedValue(undefined),
      emitChatGeneralUsuarioDesconectado: jest
        .fn()
        .mockResolvedValue(undefined),
    };

    const service = new ChatGeneralPresenceService(
      redis as never,
      config as never,
      prisma as never,
      realtime as never,
    );

    return { service, client, realtime, prisma };
  }

  it('emits usuario-conectado only on 0→1 socket transition', async () => {
    const { service, realtime } = build({ scardSequence: [1, 2] });
    const userId = '11111111-1111-4111-8111-111111111111';

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
    const userId = '11111111-1111-4111-8111-111111111111';

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
});
