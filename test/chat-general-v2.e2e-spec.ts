import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  ChatGeneralClientEvent,
  ChatGeneralErrorCode,
  ChatGeneralEvent,
  RoleName,
  type ChatGeneralAck,
  type GeneralChatMessageDto,
} from '@quantia/contracts';
import * as argon2 from 'argon2';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { NotionSyncEnqueueService } from '../src/notion/notion-sync-enqueue.service';
import { RedisService } from '../src/redis/redis.service';
import { RedisIoAdapter } from '../src/realtime/redis-io.adapter';

type Envelope = { message: GeneralChatMessageDto };

/**
 * Chat General v2: avatars, replies, edit/delete, reactions, read pointers,
 * change feed, typing and in-band re-authentication — REST + Socket.io.
 */
describe('Chat General v2 (e2e)', () => {
  let app: INestApplication;
  let adapter: RedisIoAdapter;
  let baseUrl: string;
  let prisma: PrismaService;
  let redis: RedisService;
  let tokenAna: string;
  let tokenBeto: string;
  let tokenNoAvatar: string;
  let tokenAdmin: string;
  let anaId: string;
  let betoId: string;
  const password = 'ResearchPass1!';
  const emails = {
    ana: 'v2-ana@quantia.local',
    beto: 'v2-beto@quantia.local',
    none: 'v2-noavatar@quantia.local',
    admin: 'v2-admin@quantia.local',
  };
  const sockets: Socket[] = [];

  const http = () => request(app.getHttpServer() as never);
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(NotionSyncEnqueueService)
      .useValue({
        enqueueDbToNotion: jest.fn().mockResolvedValue(undefined),
        enqueueNotionToDb: jest.fn().mockResolvedValue(undefined),
      })
      .compile();

    app = moduleFixture.createNestApplication({ rawBody: true });
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    adapter = new RedisIoAdapter(app);
    await adapter.connectToRedis();
    app.useWebSocketAdapter(adapter);
    await app.listen(0);
    const server = app.getHttpServer() as { address: () => { port: number } };
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    prisma = app.get(PrismaService);
    redis = app.get(RedisService);
    await redis.connect();
    const client = redis.getClient();
    for (const pattern of [
      'throttle:*chat-general*',
      'quantia:chat:general:presence:*',
      'ws:conn:v2:*',
    ]) {
      const keys = await client.keys(pattern);
      if (keys.length > 0) await client.del(...keys);
    }

    await prisma.generalChatMessage.deleteMany();
    await prisma.user.deleteMany({
      where: { email: { in: Object.values(emails) } },
    });
    const roles = Object.fromEntries(
      (await prisma.role.findMany()).map((r) => [r.name, r.id]),
    );
    const mk = async (
      email: string,
      fullName: string,
      role: RoleName,
      avatar: 'AVATAR_01' | 'AVATAR_02' | null,
    ) =>
      prisma.user.create({
        data: {
          email,
          fullName,
          avatar,
          passwordHash: await argon2.hash(password),
          userRoles: { create: [{ roleId: roles[role] }] },
        },
      });
    anaId = (await mk(emails.ana, 'Ana V2', RoleName.INVESTIGADOR, 'AVATAR_01'))
      .id;
    betoId = (
      await mk(emails.beto, 'Beto V2', RoleName.INVESTIGADOR, 'AVATAR_02')
    ).id;
    await mk(emails.none, 'Sin Avatar', RoleName.INVESTIGADOR, null);
    await mk(emails.admin, 'Admin V2', RoleName.ADMINISTRADOR, 'AVATAR_01');

    const login = async (email: string) =>
      (
        (
          await http()
            .post('/api/v1/auth/login')
            .send({ email, password })
            .expect(200)
        ).body as { accessToken: string }
      ).accessToken;
    tokenAna = await login(emails.ana);
    tokenBeto = await login(emails.beto);
    tokenNoAvatar = await login(emails.none);
    tokenAdmin = await login(emails.admin);
  }, 60000);

  afterEach(() => {
    while (sockets.length) sockets.pop()?.close();
  });

  afterAll(async () => {
    await new Promise((r) => setTimeout(r, 300));
    await prisma.generalChatMessage.deleteMany();
    await prisma.user.deleteMany({
      where: { email: { in: Object.values(emails) } },
    });
    try {
      await adapter.close();
    } catch {
      // ignore
    }
    await app.close();
  }, 60000);

  function connect(token: string): Socket {
    const s = io(`${baseUrl}/general`, {
      auth: { token },
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
      timeout: 8000,
    });
    sockets.push(s);
    return s;
  }

  function once<T>(socket: Socket, event: string, ms = 8000): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${event} timeout`)), ms);
      socket.once(event, (body: T) => {
        clearTimeout(timer);
        resolve(body);
      });
    });
  }

  /** Waits until a matching event arrives (ignores unrelated ones). */
  function waitFor<T>(
    socket: Socket,
    event: string,
    match: (body: T) => boolean,
    ms = 8000,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${event} timeout`)), ms);
      const handler = (body: T) => {
        if (!match(body)) return;
        clearTimeout(timer);
        socket.off(event, handler);
        resolve(body);
      };
      socket.on(event, handler);
    });
  }

  async function ready(token: string): Promise<Socket> {
    const s = connect(token);
    await once(s, ChatGeneralEvent.PRESENCIA);
    return s;
  }

  async function send(
    token: string,
    body: Record<string, unknown>,
    status = 201,
  ): Promise<GeneralChatMessageDto> {
    const res = await http()
      .post('/api/v1/chat/general/messages')
      .set(auth(token))
      .send(body)
      .expect(status);
    return (res.body as Envelope).message;
  }

  describe('avatars', () => {
    it('lists the 5 predefined avatars', async () => {
      const res = await http()
        .get('/api/v1/users/avatars')
        .set(auth(tokenNoAvatar))
        .expect(200);
      const items = (res.body as { items: Array<{ key: string }> }).items;
      expect(items.map((i) => i.key)).toEqual([
        'AVATAR_01',
        'AVATAR_02',
        'AVATAR_03',
        'AVATAR_04',
        'AVATAR_05',
      ]);
    });

    it('blocks REST chat with 403 AVATAR_REQUIRED until one is chosen', async () => {
      const me = await http()
        .get('/api/v1/users/me')
        .set(auth(tokenNoAvatar))
        .expect(200);
      expect(me.body).toMatchObject({ avatar: null, avatarRequired: true });

      const res = await http()
        .get('/api/v1/chat/general/messages')
        .set(auth(tokenNoAvatar))
        .expect(403);
      expect(res.body).toMatchObject({
        code: ChatGeneralErrorCode.AVATAR_REQUIRED,
      });
    });

    it('rejects the socket with error AVATAR_REQUIRED', async () => {
      const s = connect(tokenNoAvatar);
      const err = await once<{ code: string }>(s, 'error');
      expect(err.code).toBe(ChatGeneralErrorCode.AVATAR_REQUIRED);
    });

    it('rejects invalid avatar keys and accepts a valid one', async () => {
      await http()
        .patch('/api/v1/users/me/avatar')
        .set(auth(tokenNoAvatar))
        .send({ avatar: 'https://evil.example/me.png' })
        .expect(400);

      const watcher = await ready(tokenAna);
      const updated = waitFor<{ user: { name: string; avatar: string } }>(
        watcher,
        ChatGeneralEvent.USUARIO_ACTUALIZADO,
        (b) => b.user.name === 'Sin Avatar',
      );
      const res = await http()
        .patch('/api/v1/users/me/avatar')
        .set(auth(tokenNoAvatar))
        .send({ avatar: 'AVATAR_05' })
        .expect(200);
      expect(res.body).toMatchObject({
        avatar: 'AVATAR_05',
        avatarRequired: false,
      });
      await expect(updated).resolves.toMatchObject({
        user: { avatar: 'AVATAR_05' },
      });

      await http()
        .get('/api/v1/chat/general/messages')
        .set(auth(tokenNoAvatar))
        .expect(200);
    });
  });

  describe('messages lifecycle', () => {
    it('presence snapshot carries avatars, typing and token expiry', async () => {
      const s = connect(tokenAna);
      const snap = await once<{
        users: Array<{ id: string; avatar: string }>;
        typing: unknown[];
        tokenExpiresAt: string | null;
      }>(s, ChatGeneralEvent.PRESENCIA);
      expect(snap.users).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: anaId, avatar: 'AVATAR_01' }),
        ]),
      );
      expect(Array.isArray(snap.typing)).toBe(true);
      expect(snap.tokenExpiresAt).not.toBeNull();
    });

    it('create → reply → edit → react → delete, each fanned out', async () => {
      const beto = await ready(tokenBeto);

      const createdEvt = waitFor<Envelope>(
        beto,
        ChatGeneralEvent.MENSAJE_CREADO,
        (b) => b.message.clientMessageId === 'v2-parent',
      );
      const parent = await send(tokenAna, {
        content: 'mensaje original',
        clientMessageId: 'v2-parent',
      });
      expect(parent.seq).toBeGreaterThan(0);
      expect(parent.version).toBe(1);
      await expect(createdEvt).resolves.toMatchObject({
        message: { id: parent.id, author: { avatar: 'AVATAR_01' } },
      });

      const reply = await send(tokenBeto, {
        content: 'respuesta',
        replyToId: parent.id,
      });
      expect(reply.seq).toBeGreaterThan(parent.seq);
      expect(reply.replyTo).toMatchObject({
        id: parent.id,
        excerpt: 'mensaje original',
        deleted: false,
        author: { id: anaId },
      });

      const editedEvt = waitFor<Envelope>(
        beto,
        ChatGeneralEvent.MENSAJE_EDITADO,
        (b) => b.message.id === parent.id,
      );
      const edited = await http()
        .patch(`/api/v1/chat/general/messages/${parent.id}`)
        .set(auth(tokenAna))
        .send({ content: 'mensaje editado' })
        .expect(200);
      expect((edited.body as Envelope).message).toMatchObject({
        content: 'mensaje editado',
        version: 2,
      });
      expect((edited.body as Envelope).message.editedAt).not.toBeNull();
      await expect(editedEvt).resolves.toMatchObject({
        message: { version: 2 },
      });

      await http()
        .patch(`/api/v1/chat/general/messages/${parent.id}`)
        .set(auth(tokenBeto))
        .send({ content: 'hackeo' })
        .expect(403);

      const reactEvt = waitFor<{ messageId: string; reactions: unknown[] }>(
        beto,
        ChatGeneralEvent.REACCIONES_ACTUALIZADAS,
        (b) => b.messageId === parent.id,
      );
      const reacted = await http()
        .put(`/api/v1/chat/general/messages/${parent.id}/reaction`)
        .set(auth(tokenBeto))
        .send({ emoji: '🔥' })
        .expect(200);
      expect((reacted.body as Envelope).message.reactions).toEqual([
        { emoji: '🔥', count: 1, userIds: [betoId] },
      ]);
      await expect(reactEvt).resolves.toMatchObject({
        actorId: betoId,
        emoji: '🔥',
      });

      await http()
        .put(`/api/v1/chat/general/messages/${parent.id}/reaction`)
        .set(auth(tokenBeto))
        .send({ emoji: '💩' })
        .expect(400);

      // Replace the reaction (one per user), then clear it.
      const replaced = await http()
        .put(`/api/v1/chat/general/messages/${parent.id}/reaction`)
        .set(auth(tokenBeto))
        .send({ emoji: '👍' })
        .expect(200);
      expect((replaced.body as Envelope).message.reactions).toEqual([
        { emoji: '👍', count: 1, userIds: [betoId] },
      ]);
      const cleared = await http()
        .delete(`/api/v1/chat/general/messages/${parent.id}/reaction`)
        .set(auth(tokenBeto))
        .expect(200);
      expect((cleared.body as Envelope).message.reactions).toEqual([]);

      const deletedEvt = waitFor<{ id: string; byModerator: boolean }>(
        beto,
        ChatGeneralEvent.MENSAJE_ELIMINADO,
        (b) => b.id === parent.id,
      );
      await http()
        .delete(`/api/v1/chat/general/messages/${parent.id}`)
        .set(auth(tokenAna))
        .expect(204);
      await expect(deletedEvt).resolves.toMatchObject({ byModerator: false });
      // Idempotent.
      await http()
        .delete(`/api/v1/chat/general/messages/${parent.id}`)
        .set(auth(tokenAna))
        .expect(204);

      const history = await http()
        .get('/api/v1/chat/general/messages?limit=50')
        .set(auth(tokenAna))
        .expect(200);
      const items = (history.body as { items: GeneralChatMessageDto[] }).items;
      expect(items.find((m) => m.id === parent.id)).toBeUndefined();
      expect(items.find((m) => m.id === reply.id)?.replyTo).toMatchObject({
        deleted: true,
        excerpt: null,
      });
    });

    it('admins moderate any message; others cannot delete', async () => {
      const msg = await send(tokenBeto, { content: 'moderable' });
      await http()
        .delete(`/api/v1/chat/general/messages/${msg.id}`)
        .set(auth(tokenAna))
        .expect(403);
      await http()
        .delete(`/api/v1/chat/general/messages/${msg.id}`)
        .set(auth(tokenAdmin))
        .expect(204);
    });

    it('rejects replies to deleted messages', async () => {
      const msg = await send(tokenAna, { content: 'efimero' });
      await http()
        .delete(`/api/v1/chat/general/messages/${msg.id}`)
        .set(auth(tokenAna))
        .expect(204);
      const res = await http()
        .post('/api/v1/chat/general/messages')
        .set(auth(tokenBeto))
        .send({ content: 'tarde', replyToId: msg.id })
        .expect(400);
      expect(res.body).toMatchObject({
        code: ChatGeneralErrorCode.REPLY_TARGET_NOT_FOUND,
      });
    });

    it('change feed returns edits and tombstones since a timestamp', async () => {
      const since = new Date(Date.now() - 1000).toISOString();
      const a = await send(tokenAna, { content: 'feed-a' });
      const b = await send(tokenAna, { content: 'feed-b' });
      await http()
        .patch(`/api/v1/chat/general/messages/${a.id}`)
        .set(auth(tokenAna))
        .send({ content: 'feed-a2' })
        .expect(200);
      await http()
        .delete(`/api/v1/chat/general/messages/${b.id}`)
        .set(auth(tokenAna))
        .expect(204);

      const res = await http()
        .get('/api/v1/chat/general/updates')
        .query({ since, limit: 100 })
        .set(auth(tokenBeto))
        .expect(200);
      const body = res.body as {
        items: GeneralChatMessageDto[];
        serverTime: string;
        hasMore: boolean;
      };
      const byId = new Map(body.items.map((m) => [m.id, m]));
      expect(byId.get(a.id)).toMatchObject({ content: 'feed-a2', version: 2 });
      expect(byId.get(b.id)).toMatchObject({ content: '' });
      expect(byId.get(b.id)?.deletedAt).not.toBeNull();
      expect(typeof body.serverTime).toBe('string');

      await http()
        .get('/api/v1/chat/general/updates')
        .set(auth(tokenBeto))
        .expect(400);
    });

    it('read pointer is monotonic, clamped and broadcast', async () => {
      const ana = await ready(tokenAna);
      const m = await send(tokenBeto, { content: 'leeme' });

      const state = await http()
        .get('/api/v1/chat/general/state')
        .set(auth(tokenAna))
        .expect(200);
      const stateBody = state.body as {
        latestSeq: number;
        limits: { typingTtlMs: number };
      };
      expect(stateBody.latestSeq).toBe(m.seq);
      expect(stateBody.limits.typingTtlMs).toBeGreaterThan(0);
      expect(
        (state.body as { unreadCount: number }).unreadCount,
      ).toBeGreaterThan(0);

      const lectura = waitFor<{ userId: string; lastReadSeq: number }>(
        ana,
        ChatGeneralEvent.LECTURA,
        (b) => b.userId === anaId,
      );
      const read = await http()
        .put('/api/v1/chat/general/read')
        .set(auth(tokenAna))
        .send({ lastReadSeq: m.seq + 1000 })
        .expect(200);
      expect(read.body).toEqual({ lastReadSeq: m.seq, unreadCount: 0 });
      await expect(lectura).resolves.toMatchObject({ lastReadSeq: m.seq });

      const back = await http()
        .put('/api/v1/chat/general/read')
        .set(auth(tokenAna))
        .send({ lastReadSeq: 0 })
        .expect(200);
      expect((back.body as { lastReadSeq: number }).lastReadSeq).toBe(m.seq);
    });
  });

  describe('socket features', () => {
    it('typing is acked, fanned out and cleared', async () => {
      const ana = await ready(tokenAna);
      const beto = await ready(tokenBeto);

      const started = waitFor<{
        user: { id: string };
        isTyping: boolean;
        expiresInMs: number;
      }>(
        beto,
        ChatGeneralEvent.ESCRIBIENDO,
        (b) => b.user.id === anaId && b.isTyping,
      );
      const ack = (await ana.emitWithAck(ChatGeneralClientEvent.ESCRIBIENDO, {
        isTyping: true,
      })) as ChatGeneralAck;
      expect(ack).toEqual({ ok: true });
      expect((await started).expiresInMs).toBeGreaterThan(0);

      const stopped = waitFor<{ user: { id: string }; isTyping: boolean }>(
        beto,
        ChatGeneralEvent.ESCRIBIENDO,
        (b) => b.user.id === anaId && !b.isTyping,
      );
      await ana.emitWithAck(ChatGeneralClientEvent.ESCRIBIENDO, {
        isTyping: false,
      });
      await stopped;

      const bad = (await ana.emitWithAck(ChatGeneralClientEvent.ESCRIBIENDO, {
        isTyping: 'yes',
      })) as ChatGeneralAck;
      expect(bad).toMatchObject({
        ok: false,
        code: ChatGeneralErrorCode.INVALID_PAYLOAD,
      });
    });

    it('re-authenticates in-band and refuses another user token', async () => {
      const ana = await ready(tokenAna);
      const fresh = (
        (
          await http()
            .post('/api/v1/auth/login')
            .send({ email: emails.ana, password })
            .expect(200)
        ).body as { accessToken: string }
      ).accessToken;

      const ok = (await ana.emitWithAck(ChatGeneralClientEvent.REAUTENTICAR, {
        token: fresh,
      })) as ChatGeneralAck;
      expect(ok).toMatchObject({ ok: true });

      const other = (await ana.emitWithAck(
        ChatGeneralClientEvent.REAUTENTICAR,
        {
          token: tokenBeto,
        },
      )) as ChatGeneralAck;
      expect(other).toMatchObject({
        ok: false,
        code: ChatGeneralErrorCode.UNAUTHORIZED,
      });

      const garbage = (await ana.emitWithAck(
        ChatGeneralClientEvent.REAUTENTICAR,
        {
          token: 'nope',
        },
      )) as ChatGeneralAck;
      expect(garbage).toMatchObject({ ok: false });
    });

    it('rejects bad JWTs with error UNAUTHORIZED', async () => {
      const s = connect('not-a-jwt');
      const err = await once<{ code: string }>(s, 'error');
      expect(err.code).toBe(ChatGeneralErrorCode.UNAUTHORIZED);
    });
  });
});
