import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import {
  RoleName,
  UserResponse,
  PaginatedUsersResponse,
} from '@quantia/contracts';
import * as argon2 from 'argon2';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { LoginLockoutService } from '../src/auth/login-lockout.service';
import { PrismaService } from '../src/database/prisma.service';
import { NotionSyncEnqueueService } from '../src/notion/notion-sync-enqueue.service';

type AuthTokensBody = {
  accessToken: string;
  refreshToken: string;
};

describe('Auth & Users (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const passwords = {
    admin: 'AdminPass1!',
    coord: 'CoordPass1!',
    researcher: 'ResearchPass1!',
  };

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

    app = moduleFixture.createNestApplication();
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

    const createUser = async (
      email: string,
      fullName: string,
      password: string,
      role: RoleName,
    ) => {
      const passwordHash = await argon2.hash(password);
      return prisma.user.create({
        data: {
          email,
          fullName,
          passwordHash,
          userRoles: {
            create: [{ roleId: byName[role] }],
          },
        },
      });
    };

    await createUser(
      'admin@quantia.test',
      'Admin',
      passwords.admin,
      RoleName.ADMINISTRADOR,
    );
    await createUser(
      'coord@quantia.test',
      'Coordinator',
      passwords.coord,
      RoleName.COORDINADOR,
    );
    await createUser(
      'researcher@quantia.test',
      'Researcher',
      passwords.researcher,
      RoleName.INVESTIGADOR,
    );
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.refreshToken.deleteMany();
      await prisma.userRole.deleteMany();
      await prisma.user.deleteMany();
    }
    if (app) {
      await app.close();
    }
  });

  const login = async (email: string, password: string) => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    return response.body as AuthTokensBody;
  };

  it('keeps health public (200)', async () => {
    await request(app.getHttpServer()).get('/api/v1/health').expect(200);
  });

  it('returns 401 for /users/me without token', async () => {
    await request(app.getHttpServer()).get('/api/v1/users/me').expect(401);
  });

  it('returns 403 when investigador lists users', async () => {
    const tokens = await login('researcher@quantia.test', passwords.researcher);
    await request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .expect(403);
  });

  it('returns 200 for /users/me with valid token', async () => {
    const tokens = await login('researcher@quantia.test', passwords.researcher);
    const response = await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .expect(200);

    const body = response.body as UserResponse;
    expect(body.email).toBe('researcher@quantia.test');
    expect(body.roles).toContain(RoleName.INVESTIGADOR);
    expect(body).not.toHaveProperty('passwordHash');
  });

  it('returns 200 when admin lists users', async () => {
    const tokens = await login('admin@quantia.test', passwords.admin);
    const response = await request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .expect(200);

    const body = response.body as PaginatedUsersResponse;
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.meta.total).toBeGreaterThanOrEqual(3);
  });

  it('rotates refresh and rejects after logout', async () => {
    const loginBody = await login('coord@quantia.test', passwords.coord);

    const refreshed = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: loginBody.refreshToken })
      .expect(200);

    const refreshedBody = refreshed.body as AuthTokensBody;
    expect(refreshedBody.accessToken).toBeDefined();
    expect(refreshedBody.refreshToken).not.toBe(loginBody.refreshToken);

    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .send({ refreshToken: refreshedBody.refreshToken })
      .expect(204);

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: refreshedBody.refreshToken })
      .expect(401);
  });

  it('revokes the whole family when a rotated refresh is reused', async () => {
    const loginBody = await login('admin@quantia.test', passwords.admin);

    const rotated = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: loginBody.refreshToken })
      .expect(200);
    const rotatedBody = rotated.body as AuthTokensBody;

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: loginBody.refreshToken })
      .expect(401);

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: rotatedBody.refreshToken })
      .expect(401);
  });

  it('allows at most one winner when the same refresh is used in parallel (QX-P5-001)', async () => {
    const loginBody = await login('researcher@quantia.test', passwords.researcher);
    const rt = loginBody.refreshToken;

    const [a, b] = await Promise.all([
      request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: rt }),
      request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: rt }),
    ]);

    const codes = [a.status, b.status].sort();
    expect(codes).toEqual([200, 401]);

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: rt })
      .expect(401);
  });

  it('rejects access tokens with alg none', async () => {
    const header = Buffer.from(
      JSON.stringify({ alg: 'none', typ: 'JWT' }),
    ).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        sub: '00000000-0000-4000-8000-000000000001',
        email: 'x@y.z',
        roles: [RoleName.ADMINISTRADOR],
      }),
    ).toString('base64url');
    const forged = `${header}.${payload}.`;

    await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${forged}`)
      .expect(401);
  });

  it('rejects access tokens with wrong audience', async () => {
    const jwt = new JwtService();
    const bad = await jwt.signAsync(
      {
        sub: '00000000-0000-4000-8000-000000000001',
        email: 'x@y.z',
        roles: [RoleName.ADMINISTRADOR],
      },
      {
        secret: process.env.JWT_ACCESS_SECRET,
        algorithm: 'HS256',
        issuer: process.env.JWT_ISSUER ?? 'quantia-api',
        audience: 'wrong-audience',
        expiresIn: '15m',
      },
    );

    await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${bad}`)
      .expect(401);
  });

  it('locks out after repeated failed logins', async () => {
    const email = 'lockout-target@quantia.test';
    // Clear residual Redis lock/fail keys from prior suite runs (TTL up to 15m).
    const lockout = app.get(LoginLockoutService);
    for (const ip of ['::ffff:127.0.0.1', '127.0.0.1', '::1', 'unknown']) {
      await lockout.clear(email, ip);
    }

    for (let i = 0; i < 5; i += 1) {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: 'WrongPass1!' })
        .expect(401);
    }

    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'WrongPass1!' })
      .expect(429);
  });

  it('returns 403 when coordinator lists users (admin-only)', async () => {
    const tokens = await login('coord@quantia.test', passwords.coord);
    await request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .expect(403);
  });
});
