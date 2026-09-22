import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { RoleName } from '@quantia/contracts';
import * as argon2 from 'argon2';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { NotionSyncEnqueueService } from '../src/notion/notion-sync-enqueue.service';
import { RedisIoAdapter } from '../src/realtime/redis-io.adapter';

type AuthTokensBody = {
  accessToken: string;
};

describe('Security S2 BOLA/BFLA (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let redisAdapter: RedisIoAdapter;
  let baseUrl: string;

  let researcherAToken: string;
  let researcherBToken: string;
  let researcherAId: string;
  let projectAId: string;
  let projectBId: string;
  let taskOwnedByA: string;
  let progressOwnedByA: string;

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

    redisAdapter = new RedisIoAdapter(app);
    await redisAdapter.connectToRedis();
    app.useWebSocketAdapter(redisAdapter);

    await app.listen(0);
    const server = app.getHttpServer() as { address: () => { port: number } };
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    prisma = app.get(PrismaService);

    await prisma.syncEvent.deleteMany();
    await prisma.progress.deleteMany();
    await prisma.task.deleteMany();
    await prisma.projectMember.deleteMany();
    await prisma.project.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.userRole.deleteMany();
    await prisma.user.deleteMany();

    const roles = await prisma.role.findMany();
    const byName = Object.fromEntries(roles.map((r) => [r.name, r.id]));

    const createUser = async (email: string, role: RoleName) => {
      const passwordHash = await argon2.hash(password);
      return prisma.user.create({
        data: {
          email,
          fullName: email,
          passwordHash,
          userRoles: { create: [{ roleId: byName[role] }] },
        },
      });
    };

    const coord = await createUser(
      's2-coord@quantia.test',
      RoleName.COORDINADOR,
    );
    const resA = await createUser(
      's2-res-a@quantia.test',
      RoleName.INVESTIGADOR,
    );
    const resB = await createUser(
      's2-res-b@quantia.test',
      RoleName.INVESTIGADOR,
    );
    researcherAId = resA.id;

    const projectA = await prisma.project.create({
      data: {
        title: 'S2 Alpha',
        coordinatorId: coord.id,
        createdById: coord.id,
        members: {
          create: [{ userId: resA.id }, { userId: resB.id }],
        },
      },
    });
    const projectB = await prisma.project.create({
      data: {
        title: 'S2 Beta',
        coordinatorId: coord.id,
        createdById: coord.id,
        members: { create: [{ userId: resB.id }] },
      },
    });
    projectAId = projectA.id;
    projectBId = projectB.id;

    const task = await prisma.task.create({
      data: {
        projectId: projectAId,
        title: 'Owned by A',
        assigneeId: researcherAId,
      },
    });
    taskOwnedByA = task.id;

    const progress = await prisma.progress.create({
      data: {
        projectId: projectAId,
        authorId: researcherAId,
        title: 'Note A',
        description: 'body',
      },
    });
    progressOwnedByA = progress.id;

    const login = async (email: string) => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password })
        .expect(200);
      return (res.body as AuthTokensBody).accessToken;
    };

    researcherAToken = await login('s2-res-a@quantia.test');
    researcherBToken = await login('s2-res-b@quantia.test');
  }, 60000);

  afterAll(async () => {
    try {
      await redisAdapter.close();
    } catch {
      /* ignore */
    }
    try {
      await app.close();
    } catch {
      /* ignore */
    }
  }, 15000);

  it('researcher B cannot read project B resources as A (cross-project)', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/projects/${projectBId}`)
      .set('Authorization', `Bearer ${researcherAToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .get(`/api/v1/projects/${projectBId}/tasks`)
      .set('Authorization', `Bearer ${researcherAToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .get(`/api/v1/projects/${projectBId}/progress`)
      .set('Authorization', `Bearer ${researcherAToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .get(`/api/v1/projects/${projectBId}/budget`)
      .set('Authorization', `Bearer ${researcherAToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .get(`/api/v1/projects/${projectBId}/documents`)
      .set('Authorization', `Bearer ${researcherAToken}`)
      .expect(403);
  });

  it('member who is not author/assignee cannot update or delete', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/projects/${projectAId}/tasks/${taskOwnedByA}`)
      .set('Authorization', `Bearer ${researcherBToken}`)
      .send({ title: 'Hijack' })
      .expect(403);

    await request(app.getHttpServer())
      .delete(`/api/v1/projects/${projectAId}/tasks/${taskOwnedByA}`)
      .set('Authorization', `Bearer ${researcherBToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .patch(`/api/v1/projects/${projectAId}/progress/${progressOwnedByA}`)
      .set('Authorization', `Bearer ${researcherBToken}`)
      .send({ title: 'Hijack note' })
      .expect(403);

    await request(app.getHttpServer())
      .delete(`/api/v1/projects/${projectAId}/progress/${progressOwnedByA}`)
      .set('Authorization', `Bearer ${researcherBToken}`)
      .expect(403);
  });

  it('assignee/author can update their own resources', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/projects/${projectAId}/tasks/${taskOwnedByA}`)
      .set('Authorization', `Bearer ${researcherAToken}`)
      .send({ title: 'Owned update' })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/v1/projects/${projectAId}/progress/${progressOwnedByA}`)
      .set('Authorization', `Bearer ${researcherAToken}`)
      .send({ title: 'Owned note update' })
      .expect(200);
  });

  it('denies WebSocket join to a project without membership', async () => {
    const socket: Socket = io(`${baseUrl}/projects`, {
      auth: { token: researcherAToken },
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
    });

    await new Promise<void>((resolve, reject) => {
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

    const result = await new Promise<{ ok: boolean; error?: string }>(
      (resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('join timeout')), 5000);
        socket
          .timeout(4000)
          .emit(
            'join',
            { projectId: projectBId },
            (err: Error | null, response: { ok: boolean; error?: string }) => {
              clearTimeout(timer);
              if (err) {
                reject(err instanceof Error ? err : new Error(String(err)));
                return;
              }
              resolve(response);
            },
          );
      },
    );

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/access|denied|Forbidden|No access/i);
    socket.close();
  }, 15000);
});
