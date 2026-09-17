import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
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
import { PrismaService } from '../src/database/prisma.service';

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
    }).compile();

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
    await prisma.refreshToken.deleteMany();
    await prisma.userRole.deleteMany();
    await prisma.user.deleteMany();
    await app.close();
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
});
