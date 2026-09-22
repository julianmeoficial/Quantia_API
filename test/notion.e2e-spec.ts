import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { createHmac } from 'crypto';
import helmet from 'helmet';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { NotionSyncEnqueueService } from '../src/notion/notion-sync-enqueue.service';
import { RedisService } from '../src/redis/redis.service';

describe('Notion webhooks (e2e)', () => {
  let app: INestApplication<App>;
  let redis: RedisService;
  const enqueueNotionToDb = jest.fn().mockResolvedValue(undefined);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(NotionSyncEnqueueService)
      .useValue({
        enqueueNotionToDb,
        enqueueDbToNotion: jest.fn(),
      })
      .compile();

    app = moduleFixture.createNestApplication({ rawBody: true });
    const http = app.getHttpAdapter().getInstance() as {
      disable?: (key: string) => void;
    };
    http.disable?.('x-powered-by');
    app.use(
      helmet({
        contentSecurityPolicy: true,
        hsts: { maxAge: 15_552_000, includeSubDomains: true },
      }),
    );
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
    redis = app.get(RedisService);
    await redis.connect();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    enqueueNotionToDb.mockClear();
    const client = redis.getClient();
    const keys = await client.keys('notion:webhook:replay:*');
    if (keys.length > 0) {
      await client.del(...keys);
    }
  });

  function signBody(body: Record<string, unknown>): {
    raw: string;
    signature: string;
  } {
    const raw = JSON.stringify(body);
    const secret = process.env.NOTION_WEBHOOK_SECRET!;
    const signature = `sha256=${createHmac('sha256', secret)
      .update(raw)
      .digest('hex')}`;
    return { raw, signature };
  }

  it('handles verification_token publicly', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/webhooks/notion')
      .send({ verification_token: 'verify-me' })
      .expect(200)
      .expect({ verification_token: 'verify-me' });
  });

  it('rejects unsigned events', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/webhooks/notion')
      .send({
        entity: { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' },
        timestamp: new Date().toISOString(),
      })
      .expect(401);
  });

  it('rejects out-of-window timestamp', async () => {
    const body = {
      entity: { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' },
      type: 'page',
      timestamp: new Date(Date.now() - 600_000).toISOString(),
    };
    const { raw, signature } = signBody(body);

    await request(app.getHttpServer())
      .post('/api/v1/webhooks/notion')
      .set('x-notion-signature', signature)
      .set('Content-Type', 'application/json')
      .send(raw)
      .expect(401);
  });

  it('accepts signed events and enqueues', async () => {
    const body = {
      entity: { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' },
      type: 'page',
      timestamp: new Date().toISOString(),
    };
    const { raw, signature } = signBody(body);

    await request(app.getHttpServer())
      .post('/api/v1/webhooks/notion')
      .set('x-notion-signature', signature)
      .set('Content-Type', 'application/json')
      .send(raw)
      .expect(200);

    expect(enqueueNotionToDb).toHaveBeenCalled();
  });

  it('rejects replay of the same signed payload', async () => {
    const body = {
      entity: { id: 'bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee' },
      type: 'page',
      timestamp: new Date().toISOString(),
    };
    const { raw, signature } = signBody(body);

    await request(app.getHttpServer())
      .post('/api/v1/webhooks/notion')
      .set('x-notion-signature', signature)
      .set('Content-Type', 'application/json')
      .send(raw)
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/v1/webhooks/notion')
      .set('x-notion-signature', signature)
      .set('Content-Type', 'application/json')
      .send(raw)
      .expect(401);
  });
});
