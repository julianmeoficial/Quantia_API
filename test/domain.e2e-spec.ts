import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { RoleName } from '@quantia/contracts';
import * as argon2 from 'argon2';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';

type AuthTokensBody = {
  accessToken: string;
  refreshToken: string;
};

type ProjectBody = {
  id: string;
  title: string;
  memberIds: string[];
};

describe('Domain Projects/Tasks/Progress (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  let adminToken: string;
  let coordToken: string;
  let researcherAToken: string;
  let researcherBToken: string;

  let projectAId: string;
  let projectBId: string;
  let researcherAId: string;
  let researcherBId: string;
  let coordId: string;

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

    const admin = await createUser(
      'admin@e2e.local',
      'Admin',
      passwords.admin,
      RoleName.ADMINISTRADOR,
    );
    const coord = await createUser(
      'coord@e2e.local',
      'Coord',
      passwords.coord,
      RoleName.COORDINADOR,
    );
    const researcherA = await createUser(
      'resa@e2e.local',
      'Researcher A',
      passwords.researcher,
      RoleName.INVESTIGADOR,
    );
    const researcherB = await createUser(
      'resb@e2e.local',
      'Researcher B',
      passwords.researcher,
      RoleName.INVESTIGADOR,
    );

    researcherAId = researcherA.id;
    researcherBId = researcherB.id;
    coordId = coord.id;

    const login = async (email: string, password: string) => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password })
        .expect(200);
      return (res.body as AuthTokensBody).accessToken;
    };

    adminToken = await login('admin@e2e.local', passwords.admin);
    coordToken = await login('coord@e2e.local', passwords.coord);
    researcherAToken = await login('resa@e2e.local', passwords.researcher);
    researcherBToken = await login('resb@e2e.local', passwords.researcher);

    const projectA = await prisma.project.create({
      data: {
        title: 'Project A',
        coordinatorId: coord.id,
        createdById: admin.id,
        members: { create: [{ userId: researcherA.id }] },
      },
    });
    const projectB = await prisma.project.create({
      data: {
        title: 'Project B',
        coordinatorId: coord.id,
        createdById: coord.id,
        members: { create: [{ userId: researcherB.id }] },
      },
    });
    projectAId = projectA.id;
    projectBId = projectB.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 401 without token', async () => {
    await request(app.getHttpServer()).get('/api/v1/projects').expect(401);
  });

  it('researcher A lists only their project', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/projects')
      .set('Authorization', `Bearer ${researcherAToken}`)
      .expect(200);

    const body = res.body as { data: ProjectBody[] };
    const ids = body.data.map((p) => p.id);
    expect(ids).toContain(projectAId);
    expect(ids).not.toContain(projectBId);
  });

  it('researcher A cannot get project B', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/projects/${projectBId}`)
      .set('Authorization', `Bearer ${researcherAToken}`)
      .expect(403);
  });

  it('admin lists all projects', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const body = res.body as { data: ProjectBody[] };
    const ids = body.data.map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining([projectAId, projectBId]));
  });

  it('coordinator can CRUD in their portfolio', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${coordToken}`)
      .send({
        title: 'Coord Project',
        memberIds: [researcherAId],
      })
      .expect(201);

    const project = created.body as ProjectBody;
    expect(project.memberIds).toContain(researcherAId);

    await request(app.getHttpServer())
      .patch(`/api/v1/projects/${project.id}`)
      .set('Authorization', `Bearer ${coordToken}`)
      .send({ title: 'Coord Project Updated' })
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/api/v1/projects/${project.id}`)
      .set('Authorization', `Bearer ${coordToken}`)
      .expect(204);
  });

  it('CRUD task + progress under allowed project', async () => {
    const taskRes = await request(app.getHttpServer())
      .post(`/api/v1/projects/${projectAId}/tasks`)
      .set('Authorization', `Bearer ${researcherAToken}`)
      .send({
        title: 'Task A1',
        assigneeId: researcherAId,
        priority: 'HIGH',
      })
      .expect(201);

    const task = taskRes.body as { id: string };

    const progressRes = await request(app.getHttpServer())
      .post(`/api/v1/projects/${projectAId}/progress`)
      .set('Authorization', `Bearer ${researcherAToken}`)
      .send({
        title: 'Advance 1',
        description: 'Evidence note',
        taskId: task.id,
        evidenceLinks: ['https://example.com/proof'],
      })
      .expect(201);

    const progress = progressRes.body as { id: string; authorId: string };
    expect(progress.authorId).toBe(researcherAId);

    await request(app.getHttpServer())
      .get(`/api/v1/projects/${projectAId}/tasks`)
      .set('Authorization', `Bearer ${researcherAToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/api/v1/projects/${projectAId}/progress`)
      .set('Authorization', `Bearer ${researcherAToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/api/v1/projects/${projectAId}/progress/${progress.id}`)
      .set('Authorization', `Bearer ${researcherAToken}`)
      .expect(204);

    await request(app.getHttpServer())
      .delete(`/api/v1/projects/${projectAId}/tasks/${task.id}`)
      .set('Authorization', `Bearer ${researcherAToken}`)
      .expect(204);
  });

  it('researcher B cannot create task on project A', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/projects/${projectAId}/tasks`)
      .set('Authorization', `Bearer ${researcherBToken}`)
      .send({ title: 'Intrusion' })
      .expect(403);
  });

  it('rejects assignee who is not a member', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/projects/${projectAId}/tasks`)
      .set('Authorization', `Bearer ${coordToken}`)
      .send({
        title: 'Bad assignee',
        assigneeId: researcherBId,
      })
      .expect(403);
  });

  it('coordinator can add and remove members', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/projects/${projectAId}/members`)
      .set('Authorization', `Bearer ${coordToken}`)
      .send({ userId: researcherBId })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/api/v1/projects/${projectAId}/members/${researcherBId}`)
      .set('Authorization', `Bearer ${coordToken}`)
      .expect(204);

    // silence unused var warning for coordId in strict builds
    expect(coordId).toBeDefined();
  });
});
