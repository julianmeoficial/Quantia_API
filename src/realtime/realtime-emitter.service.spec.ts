import { ChatGeneralEvent, RealtimeNamespace } from '@quantia/contracts';
import { RealtimeEmitter } from './realtime-emitter.service';
import { REALTIME_REDIS_CHANNEL } from '../queues/realtime.constants';

describe('RealtimeEmitter', () => {
  const config = {
    get: jest.fn().mockReturnValue('general'),
  };

  it('publishes tarea.actualizada envelope to Redis channel', async () => {
    const publish = jest.fn().mockResolvedValue(1);
    const redis = {
      connect: jest.fn().mockResolvedValue(undefined),
      getClient: () => ({ publish }),
    };

    const emitter = new RealtimeEmitter(redis as never, config as never);
    const payload = {
      projectId: '11111111-1111-4111-8111-111111111111',
      taskId: '22222222-2222-4222-8222-222222222222',
      title: 'Lit',
      status: 'TODO' as const,
      priority: 'HIGH' as const,
      assigneeId: null,
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    await emitter.emitTareaActualizada(payload);

    expect(redis.connect).toHaveBeenCalled();
    expect(publish).toHaveBeenCalledWith(
      REALTIME_REDIS_CHANNEL,
      JSON.stringify({
        event: 'tarea.actualizada',
        namespace: RealtimeNamespace.PROJECTS,
        room: payload.projectId,
        payload,
      }),
    );
  });

  it('publishes chat.general.mensaje-creado to /general room', async () => {
    const publish = jest.fn().mockResolvedValue(1);
    const redis = {
      connect: jest.fn().mockResolvedValue(undefined),
      getClient: () => ({ publish }),
    };
    const emitter = new RealtimeEmitter(redis as never, config as never);
    const payload = {
      message: {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        seq: 1,
        version: 1,
        content: 'hola',
        clientMessageId: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        editedAt: null,
        deletedAt: null,
        author: {
          id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          name: 'Ana',
          avatar: 'AVATAR_01' as const,
          avatarUrl: null,
        },
        replyTo: null,
        reactions: [],
      },
    };

    await emitter.emitChatGeneralMensajeCreado(payload);

    expect(publish).toHaveBeenCalledWith(
      REALTIME_REDIS_CHANNEL,
      JSON.stringify({
        event: ChatGeneralEvent.MENSAJE_CREADO,
        namespace: RealtimeNamespace.GENERAL,
        room: 'general',
        payload,
      }),
    );
  });
});
