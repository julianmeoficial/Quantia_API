import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { type GeneralChatMessageDto, RoleName } from '@quantia/contracts';
import * as argon2 from 'argon2';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { NotionSyncEnqueueService } from '../src/notion/notion-sync-enqueue.service';

type AuthTokensBody = { accessToken: string };

describe('Chat General REST (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let accessToken: string;
  let userId: string;

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

    await app.init();
    prisma = app.get(PrismaService);

    await prisma.generalChatMessage.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.userRole.deleteMany();
    await prisma.user.deleteMany({
      where: { email: 'chat-researcher@quantia.local' },
    });

    const roleRows = await prisma.role.findMany();
    const byName = Object.fromEntries(roleRows.map((r) => [r.name, r.id]));

    const researcher = await prisma.user.create({
      data: {
        email: 'chat-researcher@quantia.local',
        fullName: 'Chat Researcher',
        passwordHash: await argon2.hash(password),
        userRoles: {
          create: [{ roleId: byName[RoleName.INVESTIGADOR] }],
        },
      },
    });
    userId = researcher.id;

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: researcher.email, password })
      .expect(200);
    accessToken = (login.body as AuthTokensBody).accessToken;
  }, 30000);

  afterAll(async () => {
    await prisma.generalChatMessage.deleteMany({
      where: { authorId: userId },
    });
    await app.close();
  });

  it('returns 401 without JWT', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/chat/general/messages')
      .expect(401);

    await request(app.getHttpServer())
      .post('/api/v1/chat/general/messages')
      .send({ content: 'hola' })
      .expect(401);
  });

  it('creates a message (201) and lists history', async () => {
    const create = await request(app.getHttpServer())
      .post('/api/v1/chat/general/messages')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ content: 'hola semillero' })
      .expect(201);

    const createdBody = create.body as { message: GeneralChatMessageDto };
    expect(createdBody).toMatchObject({
      message: {
        content: 'hola semillero',
        author: { id: userId, name: 'Chat Researcher', avatarUrl: null },
      },
    });

    const list = await request(app.getHttpServer())
      .get('/api/v1/chat/general/messages')
      .set('Authorization', `Bearer ${accessToken}`)
      .query({ limit: 10 })
      .expect(200);

    const listBody = list.body as {
      items: GeneralChatMessageDto[];
      nextCursor: string | null;
      hasMore: boolean;
    };
    expect(listBody.items.length).toBeGreaterThanOrEqual(1);
    expect(listBody).toHaveProperty('nextCursor');
    expect(listBody).toHaveProperty('hasMore');
  });

  it('is idempotent with clientMessageId (200 on replay)', async () => {
    const first = await request(app.getHttpServer())
      .post('/api/v1/chat/general/messages')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ content: 'idem', clientMessageId: 'idem-e2e-1' })
      .expect(201);

    const second = await request(app.getHttpServer())
      .post('/api/v1/chat/general/messages')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ content: 'idem', clientMessageId: 'idem-e2e-1' })
      .expect(200);

    const firstBody = first.body as { message: GeneralChatMessageDto };
    const secondBody = second.body as { message: GeneralChatMessageDto };
    expect(secondBody.message.id).toBe(firstBody.message.id);
  });

  it('rejects empty content with 400', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/chat/general/messages')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ content: '   ' })
      .expect(400);
  });

  it('rejects invalid cursor with 400', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/chat/general/messages')
      .set('Authorization', `Bearer ${accessToken}`)
      .query({ cursor: '%%%' })
      .expect(400);
  });
});
