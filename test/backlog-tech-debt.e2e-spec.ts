import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  type PaginatedUserDirectoryResponse,
  RoleName,
} from '@quantia/contracts';
import * as argon2 from 'argon2';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { LOGIN_LOCKOUT_THRESHOLDS } from '../src/auth/login-lockout.service';
import { createHttpCorsOptions } from '../src/common/cors.util';
import { PrismaService } from '../src/database/prisma.service';
import { NotionSyncEnqueueService } from '../src/notion/notion-sync-enqueue.service';
import { RedisService } from '../src/redis/redis.service';

type AuthTokensBody = { accessToken: string };

const EMAIL_DOMAIN = 'backlog.test';
const ALLOWED_ORIGIN = 'http://localhost:3000';
const AUTH_LIMIT = 8;

/**
 * Backlog técnico — directorio de usuarios para coordinadores y
 * `Retry-After` legible por el navegador en todo 429.
 */
describe('Backlog deuda técnica (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let redis: RedisService;
  let adminToken: string;
  let coordToken: string;
  let researcherToken: string;
  const previousAuthLimit = process.env.THROTTLE_AUTH_LIMIT;
  const password = 'BacklogPass1!';

  const emailOf = (local: string) => `${local}@${EMAIL_DOMAIN}`;

  async function clearRateLimitKeys(): Promise<void> {
    const client = redis.getClient();
    const keys = [
      ...(await client.keys('throttle:*')),
      ...(await client.keys('auth:login:*')),
    ];
    if (keys.length > 0) await client.del(...keys);
  }

  async function removeSuiteUsers(): Promise<void> {
    await prisma.$executeRawUnsafe(
      `SELECT set_config('app.audit_mutable', '1', false)`,
    );
    await prisma.user.deleteMany({
      where: { email: { endsWith: `@${EMAIL_DOMAIN}` } },
    });
  }

  beforeAll(async () => {
    process.env.THROTTLE_AUTH_LIMIT = String(AUTH_LIMIT);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(NotionSyncEnqueueService)
      .useValue({
        enqueueNotionToDb: jest.fn().mockResolvedValue(undefined),
        enqueueDbToNotion: jest.fn().mockResolvedValue(undefined),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.enableCors(createHttpCorsOptions([ALLOWED_ORIGIN], false));
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
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
    await removeSuiteUsers();

    const roles = await prisma.role.findMany();
    const byName = Object.fromEntries(roles.map((r) => [r.name, r.id]));
    const passwordHash = await argon2.hash(password);

    const createUser = (
      local: string,
      fullName: string,
      role: RoleName,
      isActive = true,
    ) =>
      prisma.user.create({
        data: {
          email: emailOf(local),
          fullName,
          passwordHash,
          isActive,
          userRoles: { create: [{ roleId: byName[role] }] },
        },
      });

    await createUser('admin', 'Backlog Admin', RoleName.ADMINISTRADOR);
    await createUser('coord', 'Backlog Coord', RoleName.COORDINADOR);
    await createUser('researcher', 'Backlog Researcher', RoleName.INVESTIGADOR);
    await createUser('ana', 'Ana Directorio', RoleName.INVESTIGADOR);
    await createUser('andres', 'Andrés Directorio', RoleName.INVESTIGADOR);
    await createUser(
      'inactive',
      'Ana Inactiva Directorio',
      RoleName.INVESTIGADOR,
      false,
    );

    await clearRateLimitKeys();
    const login = async (local: string) => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: emailOf(local), password })
        .expect(200);
      return (res.body as AuthTokensBody).accessToken;
    };
    adminToken = await login('admin');
    coordToken = await login('coord');
    researcherToken = await login('researcher');
  });

  afterAll(async () => {
    try {
      await clearRateLimitKeys();
      await removeSuiteUsers();
    } finally {
      await app.close();
      if (previousAuthLimit === undefined) {
        delete process.env.THROTTLE_AUTH_LIMIT;
      } else {
        process.env.THROTTLE_AUTH_LIMIT = previousAuthLimit;
      }
    }
  });

  beforeEach(async () => {
    await clearRateLimitKeys();
  });

  describe('GET /api/v1/users/directory', () => {
    const directory = () =>
      request(app.getHttpServer()).get('/api/v1/users/directory');

    it('returns 401 without token', async () => {
      await directory().query({ q: 'directorio' }).expect(401);
    });

    it('returns 403 for INVESTIGADOR', async () => {
      await directory()
        .query({ q: 'directorio' })
        .set('Authorization', `Bearer ${researcherToken}`)
        .expect(403);
    });

    it('returns 200 for COORDINADOR with only active users and minimal fields', async () => {
      const res = await directory()
        .query({ q: 'directorio' })
        .set('Authorization', `Bearer ${coordToken}`)
        .expect(200);

      const body = res.body as PaginatedUserDirectoryResponse;
      expect(body.data.map((u) => u.fullName)).toEqual([
        'Ana Directorio',
        'Andrés Directorio',
      ]);
      expect(body.meta).toEqual({
        page: 1,
        pageSize: 20,
        total: 2,
        totalPages: 1,
      });
      for (const entry of body.data) {
        expect(Object.keys(entry).sort()).toEqual(['email', 'fullName', 'id']);
      }
    });

    it('returns 200 for ADMINISTRADOR and matches by e-mail, case-insensitive', async () => {
      const res = await directory()
        .query({ q: 'ANA@BACKLOG' })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const body = res.body as PaginatedUserDirectoryResponse;
      expect(body.data).toHaveLength(1);
      expect(body.data[0].email).toBe(emailOf('ana'));
    });

    it('paginates results', async () => {
      const res = await directory()
        .query({ q: 'directorio', page: 2, pageSize: 1 })
        .set('Authorization', `Bearer ${coordToken}`)
        .expect(200);

      const body = res.body as PaginatedUserDirectoryResponse;
      expect(body.data.map((u) => u.fullName)).toEqual(['Andrés Directorio']);
      expect(body.meta).toEqual({
        page: 2,
        pageSize: 1,
        total: 2,
        totalPages: 2,
      });
    });

    it('rejects missing or too-short search terms with 400', async () => {
      await directory()
        .set('Authorization', `Bearer ${coordToken}`)
        .expect(400);
      await directory()
        .query({ q: ' a ' })
        .set('Authorization', `Bearer ${coordToken}`)
        .expect(400);
    });

    it('rejects pageSize above 50 and unknown params with 400', async () => {
      await directory()
        .query({ q: 'directorio', pageSize: 51 })
        .set('Authorization', `Bearer ${coordToken}`)
        .expect(400);
      await directory()
        .query({ q: 'directorio', role: 'ADMINISTRADOR' })
        .set('Authorization', `Bearer ${coordToken}`)
        .expect(400);
    });

    it('does not shadow GET /users/:id for admins', async () => {
      const ana = await prisma.user.findUniqueOrThrow({
        where: { email: emailOf('ana') },
      });
      await request(app.getHttpServer())
        .get(`/api/v1/users/${ana.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });
  });

  describe('Retry-After on 429', () => {
    it('login lockout returns 429 with a CORS-readable Retry-After', async () => {
      const firstTier = LOGIN_LOCKOUT_THRESHOLDS[0];
      for (let i = 0; i < firstTier.failures; i += 1) {
        await request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .send({ email: emailOf('ana'), password: 'wrong-password-xx' })
          .expect(401);
      }

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('Origin', ALLOWED_ORIGIN)
        .send({ email: emailOf('ana'), password })
        .expect(429);

      const retryAfter = Number(res.headers['retry-after']);
      expect(retryAfter).toBeGreaterThan(0);
      expect(retryAfter).toBeLessThanOrEqual(firstTier.lockSeconds);
      expect(res.headers['access-control-expose-headers']).toContain(
        'Retry-After',
      );
      expect(res.body).toMatchObject({ statusCode: 429 });
    });

    it('named throttler (auth) 429 also carries plain Retry-After', async () => {
      let last: request.Response | undefined;
      for (let i = 0; i <= AUTH_LIMIT; i += 1) {
        last = await request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .set('Origin', ALLOWED_ORIGIN)
          .send({
            email: emailOf(`ghost-${i}`),
            password: 'wrong-password-xx',
          });
      }

      expect(last?.status).toBe(429);
      expect(Number(last?.headers['retry-after'])).toBeGreaterThan(0);
      expect(last?.headers['access-control-expose-headers']).toContain(
        'Retry-After',
      );
    });

    it('does not expose CORS headers to origins outside the allowlist', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/health')
        .set('Origin', 'https://evil.example.com');
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
  });
});
