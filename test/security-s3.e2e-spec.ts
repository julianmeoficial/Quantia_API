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
import { DocumentsService } from '../src/documents/documents.service';
import { NotionSyncEnqueueService } from '../src/notion/notion-sync-enqueue.service';
import { REPORTS_QUEUE } from '../src/reports/reports.constants';
import { InMemoryStorageService } from '../src/storage/in-memory-storage.service';
import { StorageService } from '../src/storage/storage.service';

type AuthTokensBody = {
  accessToken: string;
};

/** Minimal PDF magic bytes accepted by MimeGuard. */
const PDF_BYTES = Buffer.from(
  '%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n',
  'utf8',
);

describe('Security S3 data hardening (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let storage: InMemoryStorageService;
  let documentsService: DocumentsService;

  let researcherAToken: string;
  let projectAId: string;
  let projectBId: string;
  let documentOnBId: string;

  const password = 'ResearchPass1!';

  beforeAll(async () => {
    process.env.STORAGE_MAX_UPLOAD_BYTES = '2048';

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
    documentsService = app.get(DocumentsService);

    await prisma.auditLog.deleteMany();
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
      's3-coord@quantia.test',
      RoleName.COORDINADOR,
    );
    const resA = await createUser(
      's3-res-a@quantia.test',
      RoleName.INVESTIGADOR,
    );
    const resB = await createUser(
      's3-res-b@quantia.test',
      RoleName.INVESTIGADOR,
    );

    const projectA = await prisma.project.create({
      data: {
        title: 'S3 Alpha',
        coordinatorId: coord.id,
        createdById: coord.id,
        members: { create: [{ userId: resA.id }] },
      },
    });
    const projectB = await prisma.project.create({
      data: {
        title: 'S3 Beta',
        coordinatorId: coord.id,
        createdById: coord.id,
        members: { create: [{ userId: resB.id }] },
      },
    });
    projectAId = projectA.id;
    projectBId = projectB.id;

    const docB = await prisma.document.create({
      data: {
        projectId: projectBId,
        uploadedById: resB.id,
        storageBucket: 'quantia-documents',
        storageKey: `${projectBId}/seed`,
        originalName: 'secret.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 12,
      },
    });
    documentOnBId = docB.id;

    const login = async (email: string) => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password })
        .expect(200);
      return (res.body as AuthTokensBody).accessToken;
    };

    researcherAToken = await login('s3-res-a@quantia.test');
    await login('s3-res-b@quantia.test');
  }, 60000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('rejects non-whitelisted body fields with 400', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 's3-res-a@quantia.test',
        password,
        role: 'ADMINISTRADOR',
        isAdmin: true,
      })
      .expect(400);
  });

  it('uploads a valid PDF and returns DTO without storage keys', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/projects/${projectAId}/documents`)
      .set('Authorization', `Bearer ${researcherAToken}`)
      .attach('file', PDF_BYTES, {
        filename: 'notes.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);

    expect(res.body).toMatchObject({
      projectId: projectAId,
      originalName: 'notes.pdf',
      mimeType: 'application/pdf',
    });
    expect(res.body).not.toHaveProperty('storageKey');
    expect(res.body).not.toHaveProperty('storageBucket');
    expect(res.body).not.toHaveProperty('passwordHash');
  });

  it('rejects MIME spoof (PNG declared over PDF bytes)', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/projects/${projectAId}/documents`)
      .set('Authorization', `Bearer ${researcherAToken}`)
      .attach('file', PDF_BYTES, {
        filename: 'fake.png',
        contentType: 'image/png',
      })
      .expect(400);
  });

  it('rejects oversized uploads with 413', async () => {
    const oversized = Buffer.concat([PDF_BYTES, Buffer.alloc(3000, 0x41)]);
    await request(app.getHttpServer())
      .post(`/api/v1/projects/${projectAId}/documents`)
      .set('Authorization', `Bearer ${researcherAToken}`)
      .attach('file', oversized, {
        filename: 'big.pdf',
        contentType: 'application/pdf',
      })
      .expect(413);
  });

  it('sanitizes path-traversal original names', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/projects/${projectAId}/documents`)
      .set('Authorization', `Bearer ${researcherAToken}`)
      .attach('file', PDF_BYTES, {
        filename: '../../../etc/passwd',
        contentType: 'application/pdf',
      })
      .expect(201);

    expect((res.body as { originalName: string }).originalName).toBe('passwd');
    expect((res.body as { originalName: string }).originalName).not.toContain(
      '..',
    );
  });

  it('denies cross-project document download (403)', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/projects/${projectBId}/documents/${documentOnBId}/download`)
      .set('Authorization', `Bearer ${researcherAToken}`)
      .expect(403);
  });

  it('allows member download via signed URL only', async () => {
    const upload = await request(app.getHttpServer())
      .post(`/api/v1/projects/${projectAId}/documents`)
      .set('Authorization', `Bearer ${researcherAToken}`)
      .attach('file', PDF_BYTES, {
        filename: 'mine.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);

    const uploaded = upload.body as { id: string };
    const download = await request(app.getHttpServer())
      .get(`/api/v1/projects/${projectAId}/documents/${uploaded.id}/download`)
      .set('Authorization', `Bearer ${researcherAToken}`)
      .expect(200);

    expect(download.body).toHaveProperty('url');
    expect(download.body).toHaveProperty('expiresInSeconds');
    expect(download.body).not.toHaveProperty('storageKey');
  });

  it('returns sanitized 500 without stack or table names', async () => {
    jest
      .spyOn(documentsService, 'list')
      .mockRejectedValueOnce(
        new Error('relation "secret_table" does not exist'),
      );

    const res = await request(app.getHttpServer())
      .get(`/api/v1/projects/${projectAId}/documents`)
      .set('Authorization', `Bearer ${researcherAToken}`)
      .expect(500);

    expect((res.body as { message: string }).message).toBe(
      'Internal server error',
    );
    expect(JSON.stringify(res.body)).not.toContain('secret_table');
    expect(res.body).not.toHaveProperty('stack');

    jest.restoreAllMocks();
  });

  it('rejects javascript: evidence links', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/projects/${projectAId}/progress`)
      .set('Authorization', `Bearer ${researcherAToken}`)
      .send({
        title: 'Bad link',
        description: 'xss vector',
        evidenceLinks: ['javascript:alert(1)'],
      })
      .expect(400);
  });
});
