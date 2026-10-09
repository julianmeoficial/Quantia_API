import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { RoleName } from '@quantia/contracts';
import * as argon2 from 'argon2';
import {
  json,
  urlencoded,
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { assertJsonDepth } from '../src/common/middleware/json-depth.util';
import type { EnvConfig } from '../src/config/env.schema';
import { PrismaService } from '../src/database/prisma.service';
import { NotionSyncEnqueueService } from '../src/notion/notion-sync-enqueue.service';
import { RedisService } from '../src/redis/redis.service';

type AuthTokensBody = {
  accessToken: string;
};

/**
 * S5 / ENG-131 — throttling, quotas, DENIED audit stability, health skip.
 */
describe('Security S5 resilience (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let redis: RedisService;
  let coordToken: string;
  let researcherToken: string;
  let projectId: string;
  const previousAuthLimit = process.env.THROTTLE_AUTH_LIMIT;

  const password = 'CoordPass1!';

  beforeAll(async () => {
    // Exercise production auth quota in this suite only.
    process.env.THROTTLE_AUTH_LIMIT = '10';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(NotionSyncEnqueueService)
      .useValue({
        enqueueNotionToDb: jest.fn().mockResolvedValue(undefined),
        enqueueDbToNotion: jest.fn().mockResolvedValue(undefined),
      })
      .compile();

    app = moduleFixture.createNestApplication({
      rawBody: true,
      bodyParser: false,
    });

    const config = app.get(ConfigService<EnvConfig, true>);
    const bodyLimit = config.get('HTTP_JSON_BODY_LIMIT', { infer: true });
    const maxDepth = config.get('HTTP_JSON_MAX_DEPTH', { infer: true });

    app.use(
      json({
        limit: bodyLimit,
        verify: (req: Request & { rawBody?: Buffer }, _res, buf) => {
          req.rawBody = buf;
        },
      }),
    );
    app.use(urlencoded({ extended: true, limit: bodyLimit }));
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (
        req.body &&
        typeof req.body === 'object' &&
        !assertJsonDepth(req.body, maxDepth)
      ) {
        res.status(400).json({
          statusCode: 400,
          message: 'JSON body exceeds maximum depth',
        });
        return;
      }
      next();
    });

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
    await app.init();

    prisma = app.get(PrismaService);
    redis = app.get(RedisService);
    await redis.connect();

    await prisma.$executeRawUnsafe(
      `SELECT set_config('app.audit_mutable', '1', false)`,
    );
    await prisma.auditLog.deleteMany();
    await prisma.budgetExecution.deleteMany();
    await prisma.budgetItem.deleteMany();
    await prisma.budget.deleteMany();
    await prisma.projectMember.deleteMany();
    await prisma.project.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.userRole.deleteMany();
    await prisma.generalChatMessage.deleteMany();
    await prisma.user.deleteMany();

    const roles = await prisma.role.findMany();
    const byName = Object.fromEntries(roles.map((r) => [r.name, r.id]));
    const hash = await argon2.hash(password);

    const coord = await prisma.user.create({
      data: {
        email: 's5-coord@quantia.test',
        fullName: 'S5 Coord',
        passwordHash: hash,
        isActive: true,
        userRoles: { create: [{ roleId: byName[RoleName.COORDINADOR] }] },
      },
    });
    const researcher = await prisma.user.create({
      data: {
        email: 's5-researcher@quantia.test',
        fullName: 'S5 Researcher',
        passwordHash: hash,
        isActive: true,
        userRoles: { create: [{ roleId: byName[RoleName.INVESTIGADOR] }] },
      },
    });

    const project = await prisma.project.create({
      data: {
        title: 'S5 Project',
        coordinatorId: coord.id,
        createdById: coord.id,
        members: {
          create: [{ userId: coord.id }, { userId: researcher.id }],
        },
      },
    });
    projectId = project.id;

    const login = async (email: string) => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password })
        .expect(200);
      return (res.body as AuthTokensBody).accessToken;
    };

    // Clear throttle keys before legitimate logins
    const client = redis.getClient();
    const keys = await client.keys('throttle:*');
    if (keys.length > 0) await client.del(...keys);

    coordToken = await login('s5-coord@quantia.test');
    researcherToken = await login('s5-researcher@quantia.test');
  });

  afterAll(async () => {
    await app.close();
    if (previousAuthLimit === undefined) {
      delete process.env.THROTTLE_AUTH_LIMIT;
    } else {
      process.env.THROTTLE_AUTH_LIMIT = previousAuthLimit;
    }
    try {
      const client = redis.getClient();
      const keys = await client.keys('throttle:*');
      if (keys.length > 0) await client.del(...keys);
    } catch {
      // redis may already be closed
    }
  });

  beforeEach(async () => {
    const client = redis.getClient();
    const keys = await client.keys('throttle:*');
    if (keys.length > 0) {
      await client.del(...keys);
    }
    const lockKeys = await client.keys('auth:login:*');
    if (lockKeys.length > 0) {
      await client.del(...lockKeys);
    }
  });

  it('returns 429 when auth endpoints are spammed', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 12; i += 1) {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'nobody@quantia.test', password: 'wrong-password-xx' });
      statuses.push(res.status);
    }
    expect(statuses.some((s) => s === 429)).toBe(true);
  });

  it('does not throttle health', async () => {
    for (let i = 0; i < 15; i += 1) {
      await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    }
  });

  it('rejects pageSize > 50 with 400', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/projects')
      .query({ page: 1, pageSize: 51 })
      .set('Authorization', `Bearer ${coordToken}`)
      .expect(400);
  });

  it('rejects oversized JSON body with 413', async () => {
    const big = 'x'.repeat(1_200_000);
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ email: 'a@b.co', password: big }));
    expect(res.status).toBe(413);
  });

  it('rejects deep JSON with 400', async () => {
    let nest: Record<string, unknown> = { email: 'a@b.co', password: 'x' };
    for (let i = 0; i < 12; i += 1) {
      nest = { child: nest };
    }
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send(nest);
    expect(res.status).toBe(400);
  });

  it('audits role DENIED stably', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/projects/${projectId}/budget`)
      .set('Authorization', `Bearer ${researcherToken}`)
      .send({ totalAmount: '1.00' })
      .expect(403);

    let denied: { result: string } | null = null;
    for (let i = 0; i < 20; i += 1) {
      denied = await prisma.auditLog.findFirst({
        where: { result: 'DENIED', resource: 'budget' },
        orderBy: { createdAt: 'desc' },
      });
      if (denied) break;
      await new Promise((r) => setTimeout(r, 25));
    }
    expect(denied).toBeTruthy();
  });
});
