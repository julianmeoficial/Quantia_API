import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { Test, TestingModule } from '@nestjs/testing';
import { RoleName } from '@quantia/contracts';
import * as argon2 from 'argon2';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { NotionSyncEnqueueService } from '../src/notion/notion-sync-enqueue.service';
import { REPORTS_QUEUE } from '../src/reports/reports.constants';
import { InMemoryStorageService } from '../src/storage/in-memory-storage.service';
import { StorageService } from '../src/storage/storage.service';

type AuthTokensBody = {
  accessToken: string;
};

describe('F5 Budget/Documents/Reports (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let storage: InMemoryStorageService;

  let coordToken: string;
  let researcherToken: string;
  let projectId: string;
  let coordId: string;

  const passwords = {
    coord: 'CoordPass1!',
    researcher: 'ResearchPass1!',
  };

  beforeAll(async () => {
    storage = new InMemoryStorageService();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(NotionSyncEnqueueService)
      .useValue({
        enqueueDbToNotion: jest.fn().mockResolvedValue(undefined),
        enqueueNotionToDb: jest.fn().mockResolvedValue(undefined),
      })
      .overrideProvider(StorageService)
      .useValue(storage)
      .overrideProvider(getQueueToken(REPORTS_QUEUE))
      .useValue({
        add: jest.fn().mockResolvedValue({ id: 'mock-job' }),
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

    await prisma.auditLog.deleteMany();
    await prisma.budgetExecution.deleteMany();
    await prisma.budgetItem.deleteMany();
    await prisma.budget.deleteMany();
    await prisma.document.deleteMany();
    await prisma.report.deleteMany();
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

    const coord = await createUser(
      'coord-f5@e2e.local',
      'Coord F5',
      passwords.coord,
      RoleName.COORDINADOR,
    );
    const researcher = await createUser(
      'res-f5@e2e.local',
      'Researcher F5',
      passwords.researcher,
      RoleName.INVESTIGADOR,
    );
    coordId = coord.id;

    const project = await prisma.project.create({
      data: {
        title: 'F5 Project',
        coordinatorId: coord.id,
        createdById: coord.id,
        members: { create: [{ userId: researcher.id }] },
      },
    });
    projectId = project.id;

    const login = async (email: string, password: string) => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password })
        .expect(200);
      return (res.body as AuthTokensBody).accessToken;
    };

    coordToken = await login('coord-f5@e2e.local', passwords.coord);
    researcherToken = await login('res-f5@e2e.local', passwords.researcher);
  });

  afterAll(async () => {
    await app.close();
  });

  it('coord creates budget and execution; audit_log row exists', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/projects/${projectId}/budget`)
      .set('Authorization', `Bearer ${coordToken}`)
      .send({
        totalAmount: '5000.00',
        currency: 'COP',
        alertThresholdPercent: 80,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/projects/${projectId}/budget/executions`)
      .set('Authorization', `Bearer ${coordToken}`)
      .send({
        kind: 'PAYMENT',
        amount: '100.00',
      })
      .expect(201);

    const audits = await prisma.auditLog.findMany({
      where: { actorId: coordId, resource: 'budget' },
    });
    expect(audits.length).toBeGreaterThan(0);
    expect(audits.some((a) => a.result === 'SUCCESS')).toBe(true);
  });

  it('researcher cannot create budget (403) and is audited as DENIED', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/projects/${projectId}/budget`)
      .set('Authorization', `Bearer ${researcherToken}`)
      .send({ totalAmount: '1.00' })
      .expect(403);

    const denied = await prisma.auditLog.findFirst({
      where: { result: 'DENIED', resource: 'budget' },
      orderBy: { createdAt: 'desc' },
    });
    expect(denied).toBeTruthy();
  });

  it('POST report returns 202 and queues job', async () => {
    const queue = app.get<{ add: jest.Mock }>(getQueueToken(REPORTS_QUEUE));
    const res = await request(app.getHttpServer())
      .post(`/api/v1/projects/${projectId}/reports`)
      .set('Authorization', `Bearer ${coordToken}`)
      .send({ kind: 'BUDGET_PDF' })
      .expect(202);

    const body = res.body as { reportId: string; status: string };
    expect(body).toMatchObject({
      reportId: expect.any(String) as string,
      status: 'QUEUED',
    });
    expect(queue.add).toHaveBeenCalled();
  });
});
