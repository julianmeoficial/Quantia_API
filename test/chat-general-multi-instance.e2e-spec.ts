import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  ChatGeneralEvent,
  type GeneralChatMessageDto,
  RoleName,
} from '@quantia/contracts';
import * as argon2 from 'argon2';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { NotionSyncEnqueueService } from '../src/notion/notion-sync-enqueue.service';
import { RedisService } from '../src/redis/redis.service';
import { RedisIoAdapter } from '../src/realtime/redis-io.adapter';

type AuthTokensBody = { accessToken: string };

async function bootApp(): Promise<{
  app: INestApplication;
  adapter: RedisIoAdapter;
  baseUrl: string;
}> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(NotionSyncEnqueueService)
    .useValue({
      enqueueDbToNotion: jest.fn().mockResolvedValue(undefined),
      enqueueNotionToDb: jest.fn().mockResolvedValue(undefined),
    })
    .compile();

  const app = moduleFixture.createNestApplication({ rawBody: true });
  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableCors({
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
    credentials: true,
  });

  const adapter = new RedisIoAdapter(app);
  await adapter.connectToRedis();
  app.useWebSocketAdapter(adapter);

  await app.listen(0);
  const server = app.getHttpServer() as { address: () => { port: number } };
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  return { app, adapter, baseUrl };
}

describe('Chat General multi-instance (e2e)', () => {
  let app1: INestApplication;
  let app2: INestApplication;
  let adapter1: RedisIoAdapter;
  let adapter2: RedisIoAdapter;
  let baseUrl1: string;
  let baseUrl2: string;
  let prisma: PrismaService;
  let redis: RedisService;
  let tokenA: string;
  let tokenB: string;
  let userAId: string;

  const password = 'ResearchPass1!';

  beforeAll(async () => {
    const first = await bootApp();
    app1 = first.app;
    adapter1 = first.adapter;
    baseUrl1 = first.baseUrl;

    const second = await bootApp();
    app2 = second.app;
    adapter2 = second.adapter;
    baseUrl2 = second.baseUrl;

    prisma = app1.get(PrismaService);
    redis = app1.get(RedisService);
    await redis.connect();
    const redisClient = redis.getClient();
    const throttleKeys = await redisClient.keys('throttle:*chat-general*');
    if (throttleKeys.length > 0) {
      await redisClient.del(...throttleKeys);
    }
    const presenceKeys = await redisClient.keys(
      'quantia:chat:general:presence:*',
    );
    if (presenceKeys.length > 0) {
      await redisClient.del(...presenceKeys);
    }

    await prisma.generalChatMessage.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.userRole.deleteMany();
    await prisma.user.deleteMany({
      where: {
        email: {
          in: ['mi-user-a@quantia.local', 'mi-user-b@quantia.local'],
        },
      },
    });

    const roleRows = await prisma.role.findMany();
    const byName = Object.fromEntries(roleRows.map((r) => [r.name, r.id]));

    const userA = await prisma.user.create({
      data: {
        email: 'mi-user-a@quantia.local',
        fullName: 'Multi A',
        passwordHash: await argon2.hash(password),
        avatar: 'AVATAR_01',
        userRoles: {
          create: [{ roleId: byName[RoleName.INVESTIGADOR] }],
        },
      },
    });
    userAId = userA.id;

    const userB = await prisma.user.create({
      data: {
        email: 'mi-user-b@quantia.local',
        fullName: 'Multi B',
        passwordHash: await argon2.hash(password),
        avatar: 'AVATAR_01',
        userRoles: {
          create: [{ roleId: byName[RoleName.INVESTIGADOR] }],
        },
      },
    });

    const loginA = await request(app1.getHttpServer() as never)
      .post('/api/v1/auth/login')
      .send({ email: userA.email, password })
      .expect(200);
    tokenA = (loginA.body as AuthTokensBody).accessToken;

    const loginB = await request(app2.getHttpServer() as never)
      .post('/api/v1/auth/login')
      .send({ email: userB.email, password })
      .expect(200);
    tokenB = (loginB.body as AuthTokensBody).accessToken;
  }, 60000);

  afterAll(async () => {
    // Give sockets/bridges a beat to settle before tearing Redis adapters down.
    await new Promise((r) => setTimeout(r, 500));
    try {
      await adapter1.close();
    } catch {
      // ignore
    }
    try {
      await adapter2.close();
    } catch {
      // ignore
    }
    try {
      await app1.close();
    } catch {
      // ignore
    }
    try {
      await app2.close();
    } catch {
      // ignore
    }
  }, 60000);

  function connectGeneral(baseUrl: string, token: string): Socket {
    return io(`${baseUrl}/general`, {
      auth: { token },
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
      timeout: 8000,
    });
  }

  function waitConnected(socket: Socket): Promise<void> {
    if (socket.connected) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('connect timeout')),
        8000,
      );
      socket.on('connect', () => {
        clearTimeout(timer);
        resolve();
      });
      socket.on('connect_error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  it('shares presence and mensaje-creado across two API instances via Redis', async () => {
    const socketB = connectGeneral(baseUrl2, tokenB);
    await waitConnected(socketB);

    const presenciaB = new Promise<{ users: Array<{ id: string }> }>(
      (resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error('presencia B timeout')),
          10000,
        );
        socketB.once(ChatGeneralEvent.PRESENCIA, (body) => {
          clearTimeout(timer);
          resolve(body as { users: Array<{ id: string }> });
        });
      },
    );
    await presenciaB;

    const connectedOnB = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('usuario-conectado cross-instance timeout')),
        10000,
      );
      socketB.on(ChatGeneralEvent.USUARIO_CONECTADO, (body) => {
        if ((body as { user?: { id?: string } }).user?.id === userAId) {
          clearTimeout(timer);
          resolve();
        }
      });
    });

    const socketA = connectGeneral(baseUrl1, tokenA);
    await waitConnected(socketA);
    await connectedOnB;

    const mensajeOnB = new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('mensaje-creado cross-instance timeout')),
        10000,
      );
      socketB.once(ChatGeneralEvent.MENSAJE_CREADO, (body) => {
        clearTimeout(timer);
        resolve(body);
      });
    });

    await redis.connect();
    const throttleKeys = await redis
      .getClient()
      .keys('throttle:*chat-general*');
    if (throttleKeys.length > 0) {
      await redis.getClient().del(...throttleKeys);
    }

    const create = await request(app1.getHttpServer() as never)
      .post('/api/v1/chat/general/messages')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ content: 'hola desde instancia 1' })
      .expect(201);

    const created = create.body as { message: GeneralChatMessageDto };
    const event = (await mensajeOnB) as {
      message: GeneralChatMessageDto;
    };
    expect(event.message.id).toBe(created.message.id);
    expect(event.message.content).toBe('hola desde instancia 1');

    socketA.close();
    socketB.close();
  }, 30000);
});
