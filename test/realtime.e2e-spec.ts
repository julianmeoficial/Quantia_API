import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { RealtimeEvent, RoleName } from '@quantia/contracts';
import * as argon2 from 'argon2';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { NotionSyncEnqueueService } from '../src/notion/notion-sync-enqueue.service';
import { RealtimeEmitter } from '../src/realtime/realtime-emitter.service';
import { RedisIoAdapter } from '../src/realtime/redis-io.adapter';

type AuthTokensBody = {
  accessToken: string;
};

describe('Realtime Socket.io (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let emitter: RealtimeEmitter;
  let baseUrl: string;
  let accessToken: string;
  let projectId: string;
  let redisAdapter: RedisIoAdapter;

  const password = 'ResearchPass1!';

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

    redisAdapter = new RedisIoAdapter(app);
    await redisAdapter.connectToRedis();
    app.useWebSocketAdapter(redisAdapter);

    await app.listen(0);
    const server = app.getHttpServer() as { address: () => { port: number } };
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;

    prisma = app.get(PrismaService);
    emitter = app.get(RealtimeEmitter);

    await prisma.syncEvent.deleteMany();
    await prisma.progress.deleteMany();
    await prisma.task.deleteMany();
    await prisma.projectMember.deleteMany();
    await prisma.project.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.userRole.deleteMany();
    await prisma.user.deleteMany();

    const roleRows = await prisma.role.findMany();
    const byName = Object.fromEntries(roleRows.map((r) => [r.name, r.id]));

    const researcher = await prisma.user.create({
      data: {
        email: 'rt-researcher@quantia.local',
        fullName: 'RT Researcher',
        passwordHash: await argon2.hash(password),
        userRoles: {
          create: [{ roleId: byName[RoleName.INVESTIGADOR] }],
        },
      },
    });

    const project = await prisma.project.create({
      data: {
        title: 'Realtime Project',
        coordinatorId: researcher.id,
        createdById: researcher.id,
        members: { create: [{ userId: researcher.id }] },
      },
    });
    projectId = project.id;

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: researcher.email, password })
      .expect(200);
    accessToken = (login.body as AuthTokensBody).accessToken;
  }, 30000);

  afterAll(async () => {
    try {
      await redisAdapter.close();
    } catch {
      // ignore adapter quit races
    }
    try {
      await app.close();
    } catch {
      // ignore redis subscriber teardown races
    }
  }, 15000);

  function connectProjects(token?: string): {
    socket: Socket;
    authenticated: Promise<void>;
  } {
    const socket = io(`${baseUrl}/projects`, {
      auth: token ? { token } : {},
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
      timeout: 5000,
    });
    const authenticated = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('auth timeout')), 5000);
      socket.once('authenticated', () => {
        clearTimeout(timer);
        resolve();
      });
      socket.on('connect_error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
    return { socket, authenticated };
  }

  function waitConnected(socket: Socket): Promise<void> {
    if (socket.connected) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('connect timeout')),
        5000,
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

  function waitJoined(socket: Socket, room: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('join timeout')), 5000);
      socket.once('joined', (body: { room: string }) => {
        clearTimeout(timer);
        if (body.room === room) resolve();
        else reject(new Error(`joined wrong room ${body.room}`));
      });
      socket.emit('join', { projectId: room });
    });
  }

  it('rejects client without JWT', async () => {
    const { socket } = connectProjects();
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Expected rejection without JWT')),
        5000,
      );
      socket.on('connect_error', () => {
        clearTimeout(timer);
        socket.close();
        resolve();
      });
      socket.on('disconnect', () => {
        clearTimeout(timer);
        socket.close();
        resolve();
      });
    });
  });

  it('two clients in the same room receive worker-path tarea.actualizada', async () => {
    const a = connectProjects(accessToken);
    const b = connectProjects(accessToken);

    await Promise.all([
      waitConnected(a.socket),
      waitConnected(b.socket),
      a.authenticated,
      b.authenticated,
    ]);
    await Promise.all([
      waitJoined(a.socket, projectId),
      waitJoined(b.socket, projectId),
    ]);

    const payload = {
      projectId,
      taskId: '33333333-3333-4333-8333-333333333333',
      title: 'From worker path',
      status: 'IN_PROGRESS' as const,
      priority: 'MEDIUM' as const,
      assigneeId: null,
      updatedAt: new Date().toISOString(),
    };

    const received = Promise.all([
      new Promise<unknown>((resolve) => {
        a.socket.once(RealtimeEvent.TAREA_ACTUALIZADA, resolve);
      }),
      new Promise<unknown>((resolve) => {
        b.socket.once(RealtimeEvent.TAREA_ACTUALIZADA, resolve);
      }),
    ]);

    await emitter.emitTareaActualizada(payload);

    const [eventA, eventB] = await Promise.race([
      received,
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error('Timed out waiting for events')),
          8000,
        ),
      ),
    ]);

    expect(eventA).toMatchObject({
      taskId: payload.taskId,
      title: payload.title,
    });
    expect(eventB).toMatchObject({
      taskId: payload.taskId,
      title: payload.title,
    });

    a.socket.close();
    b.socket.close();
  }, 20000);
});
