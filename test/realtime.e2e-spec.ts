import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ChatGeneralEvent, RealtimeEvent, RoleName } from '@quantia/contracts';
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
  let observerToken: string;
  let researcherId: string;
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
    await prisma.generalChatMessage.deleteMany();
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
    researcherId = researcher.id;

    const observer = await prisma.user.create({
      data: {
        email: 'rt-observer@quantia.local',
        fullName: 'RT Observer',
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

    const observerLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: observer.email, password })
      .expect(200);
    observerToken = (observerLogin.body as AuthTokensBody).accessToken;
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
    const authenticated = token
      ? new Promise<void>((resolve, reject) => {
          const timer = setTimeout(
            () => reject(new Error('auth timeout')),
            5000,
          );
          socket.once('authenticated', () => {
            clearTimeout(timer);
            resolve();
          });
          socket.on('connect_error', (err) => {
            clearTimeout(timer);
            reject(err);
          });
        })
      : Promise.resolve();
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

  function connectGeneral(token?: string): Socket {
    return io(`${baseUrl}/general`, {
      auth: token ? { token } : {},
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
      timeout: 5000,
    });
  }

  it('rejects /general client without JWT', async () => {
    const socket = connectGeneral();
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Expected rejection without JWT on /general')),
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

  it('rejects /general client with invalid JWT', async () => {
    const socket = connectGeneral('not-a-valid-jwt');
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Expected rejection with invalid JWT')),
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

  it('sends presencia on /general join and fans out mensaje-creado', async () => {
    const a = connectGeneral(accessToken);
    const b = connectGeneral(accessToken);

    const presenciaA = new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('presencia timeout')),
        8000,
      );
      a.once(ChatGeneralEvent.PRESENCIA, (body) => {
        clearTimeout(timer);
        resolve(body);
      });
    });

    await Promise.all([waitConnected(a), waitConnected(b), presenciaA]);

    const received = Promise.all([
      new Promise<unknown>((resolve) => {
        a.once(ChatGeneralEvent.MENSAJE_CREADO, resolve);
      }),
      new Promise<unknown>((resolve) => {
        b.once(ChatGeneralEvent.MENSAJE_CREADO, resolve);
      }),
    ]);

    await emitter.emitChatGeneralMensajeCreado({
      message: {
        id: '66666666-6666-4666-8666-666666666666',
        content: 'desde bridge',
        clientMessageId: null,
        createdAt: new Date().toISOString(),
        author: {
          id: '77777777-7777-4777-8777-777777777777',
          name: 'Bridge',
          avatarUrl: null,
        },
      },
    });

    const [eventA, eventB] = await Promise.race([
      received,
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error('Timed out waiting for mensaje-creado')),
          8000,
        ),
      ),
    ]);

    expect(eventA).toMatchObject({
      message: { content: 'desde bridge' },
    });
    expect(eventB).toMatchObject({
      message: { content: 'desde bridge' },
    });
    expect(JSON.stringify(eventA)).not.toMatch(/"email"/);

    a.close();
    b.close();
  }, 20000);

  it('counts two tabs of the same user as one presence and disconnects on last socket', async () => {
    const observer = connectGeneral(observerToken);
    await waitConnected(observer);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('observer presencia timeout')),
        8000,
      );
      observer.once(ChatGeneralEvent.PRESENCIA, () => {
        clearTimeout(timer);
        resolve();
      });
    });

    const connectedEvents: unknown[] = [];
    const disconnectedEvents: unknown[] = [];
    observer.on(ChatGeneralEvent.USUARIO_CONECTADO, (p) =>
      connectedEvents.push(p),
    );
    observer.on(ChatGeneralEvent.USUARIO_DESCONECTADO, (p) =>
      disconnectedEvents.push(p),
    );

    const tab1 = connectGeneral(accessToken);
    await waitConnected(tab1);
    await new Promise((r) => setTimeout(r, 300));

    expect(
      connectedEvents.filter(
        (e) => (e as { user?: { id?: string } }).user?.id === researcherId,
      ),
    ).toHaveLength(1);

    const tab2 = connectGeneral(accessToken);
    const presenciaTab2 = new Promise<{
      users: Array<{ id: string }>;
    }>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('tab2 presencia timeout')),
        8000,
      );
      tab2.once(ChatGeneralEvent.PRESENCIA, (body) => {
        clearTimeout(timer);
        resolve(body as { users: Array<{ id: string }> });
      });
    });
    await waitConnected(tab2);
    const snap = await presenciaTab2;
    const researcherEntries = snap.users.filter((u) => u.id === researcherId);
    expect(researcherEntries).toHaveLength(1);

    await new Promise((r) => setTimeout(r, 300));
    expect(
      connectedEvents.filter(
        (e) => (e as { user?: { id?: string } }).user?.id === researcherId,
      ),
    ).toHaveLength(1);

    tab1.close();
    await new Promise((r) => setTimeout(r, 400));
    expect(
      disconnectedEvents.filter(
        (e) => (e as { userId?: string }).userId === researcherId,
      ),
    ).toHaveLength(0);

    const lastDisconnect = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('usuario-desconectado timeout')),
        8000,
      );
      observer.once(ChatGeneralEvent.USUARIO_DESCONECTADO, (body) => {
        if ((body as { userId?: string }).userId === researcherId) {
          clearTimeout(timer);
          resolve();
        }
      });
    });
    tab2.close();
    await lastDisconnect;

    observer.close();
  }, 25000);

  it('keeps /notifications namespace accepting authenticated clients', async () => {
    const socket = io(`${baseUrl}/notifications`, {
      auth: { token: accessToken },
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
      timeout: 5000,
    });
    await waitConnected(socket);
    expect(socket.connected).toBe(true);
    socket.close();
  });
});
