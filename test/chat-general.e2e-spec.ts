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
import { RedisService } from '../src/redis/redis.service';

type AuthTokensBody = { accessToken: string };

function assertNoSensitiveFields(payload: unknown): void {
  const raw = JSON.stringify(payload);
  expect(raw).not.toMatch(/passwordHash|password_hash/i);
  expect(raw).not.toMatch(/"email"\s*:/);
  expect(raw).not.toMatch(/accessToken|refreshToken|"token"/i);
  expect(raw).not.toMatch(/Authorization/i);
}

describe('Chat General REST (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let accessToken: string;
  let userId: string;

  const password = 'ResearchPass1!';
  const email = 'chat-researcher@quantia.local';

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
    await prisma.user.deleteMany({ where: { email } });

    const roleRows = await prisma.role.findMany();
    const byName = Object.fromEntries(roleRows.map((r) => [r.name, r.id]));

    const researcher = await prisma.user.create({
      data: {
        email,
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

  it('creates a message (201) and lists history without sensitive fields', async () => {
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
    assertNoSensitiveFields(createdBody);

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
    assertNoSensitiveFields(listBody);
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

  it('rejects content longer than CHAT_GENERAL_MESSAGE_MAX_LENGTH', async () => {
    const max = Number(process.env.CHAT_GENERAL_MESSAGE_MAX_LENGTH ?? 2000);
    await request(app.getHttpServer())
      .post('/api/v1/chat/general/messages')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ content: 'x'.repeat(max + 1) })
      .expect(400);
  });

  it('rejects invalid cursor with 400', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/chat/general/messages')
      .set('Authorization', `Bearer ${accessToken}`)
      .query({ cursor: '%%%' })
      .expect(400);
  });

  it('paginates history by cursor without duplicates or omissions', async () => {
    await prisma.generalChatMessage.deleteMany({ where: { authorId: userId } });

    const createdIds: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      const res = await request(app.getHttpServer())
        .post('/api/v1/chat/general/messages')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ content: `page-msg-${i}` })
        .expect(201);
      const body = res.body as { message: GeneralChatMessageDto };
      createdIds.push(body.message.id);
    }

    const collected: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const res = await request(app.getHttpServer())
        .get('/api/v1/chat/general/messages')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ limit: 2, ...(cursor ? { cursor } : {}) })
        .expect(200);
      const body = res.body as {
        items: GeneralChatMessageDto[];
        nextCursor: string | null;
        hasMore: boolean;
      };
      for (const item of body.items) {
        collected.push(item.id);
      }
      cursor = body.nextCursor ?? undefined;
      pages += 1;
      if (!body.hasMore) break;
    } while (cursor && pages < 10);

    expect(new Set(collected).size).toBe(collected.length);
    expect(collected.sort()).toEqual([...createdIds].sort());
  });
});

describe('Chat General REST rate limit (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let redis: RedisService;
  let accessToken: string;
  let userId: string;
  const previousLimit = process.env.CHAT_GENERAL_RATE_LIMIT;
  const password = 'ResearchPass1!';
  const email = 'chat-ratelimit@quantia.local';

  beforeAll(async () => {
    process.env.CHAT_GENERAL_RATE_LIMIT = '2';

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
    redis = app.get(RedisService);

    await prisma.user.deleteMany({ where: { email } });
    const roleRows = await prisma.role.findMany();
    const byName = Object.fromEntries(roleRows.map((r) => [r.name, r.id]));
    const researcher = await prisma.user.create({
      data: {
        email,
        fullName: 'Rate Limit User',
        passwordHash: await argon2.hash(password),
        userRoles: {
          create: [{ roleId: byName[RoleName.INVESTIGADOR] }],
        },
      },
    });
    userId = researcher.id;

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    accessToken = (login.body as AuthTokensBody).accessToken;
  }, 30000);

  afterAll(async () => {
    if (previousLimit === undefined) {
      delete process.env.CHAT_GENERAL_RATE_LIMIT;
    } else {
      process.env.CHAT_GENERAL_RATE_LIMIT = previousLimit;
    }
    await prisma.generalChatMessage.deleteMany({ where: { authorId: userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await app.close();
  });

  it('returns 429 after exceeding CHAT_GENERAL_RATE_LIMIT', async () => {
    await redis.connect();
    const client = redis.getClient();
    const keys = await client.keys('throttle:*chat-general*');
    if (keys.length > 0) {
      await client.del(...keys);
    }

    await request(app.getHttpServer())
      .post('/api/v1/chat/general/messages')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ content: 'rl-1' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/chat/general/messages')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ content: 'rl-2' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/chat/general/messages')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ content: 'rl-3' })
      .expect(429);
  });

  afterEach(async () => {
    await redis.connect();
    const client = redis.getClient();
    const keys = await client.keys('throttle:*chat-general*');
    if (keys.length > 0) {
      await client.del(...keys);
    }
  });
});
