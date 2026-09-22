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
import {
  createCorsOriginDelegate,
  parseCorsOrigins,
} from '../src/common/cors.util';
import { NotionSyncEnqueueService } from '../src/notion/notion-sync-enqueue.service';
import { RedisService } from '../src/redis/redis.service';

/**
 * S4 / ENG-130 — infrastructure, secrets, headers, webhook hardening.
 */
describe('Security S4 infra hardening (e2e)', () => {
  let app: INestApplication<App>;
  let redis: RedisService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(NotionSyncEnqueueService)
      .useValue({
        enqueueNotionToDb: jest.fn().mockResolvedValue(undefined),
        enqueueDbToNotion: jest.fn().mockResolvedValue(undefined),
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

    const allowlist = parseCorsOrigins(
      process.env.CORS_ORIGINS ?? 'http://localhost:3000',
    );
    app.enableCors({
      origin: createCorsOriginDelegate(allowlist, false),
      credentials: true,
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
    redis = app.get(RedisService);
    await redis.connect();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    const client = redis.getClient();
    const keys = await client.keys('notion:webhook:replay:*');
    if (keys.length > 0) {
      await client.del(...keys);
    }
  });

  it('sets security headers and omits X-Powered-By', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);

    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['strict-transport-security']).toMatch(/max-age=/);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBeTruthy();
  });

  it('rejects arbitrary CORS Origin', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('Origin', 'https://evil.example.com');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('allows allowlisted CORS Origin', async () => {
    const origin = 'http://localhost:3000';
    const res = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('Origin', origin)
      .expect(200);

    expect(res.headers['access-control-allow-origin']).toBe(origin);
  });

  it('does not mount Swagger UI under test bootstrap without setup', async () => {
    // E2E harness never calls SwaggerModule.setup (mirrors production/staging).
    await request(app.getHttpServer()).get('/api/docs').expect(404);
  });

  it('rejects webhook with bad signature', async () => {
    const body = {
      entity: { id: 'cccccccc-bbbb-cccc-dddd-eeeeeeeeeeee' },
      type: 'page',
      timestamp: new Date().toISOString(),
    };
    await request(app.getHttpServer())
      .post('/api/v1/webhooks/notion')
      .set('x-notion-signature', 'sha256=deadbeef')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(body))
      .expect(401);
  });

  it('rejects webhook replay', async () => {
    const body = {
      entity: { id: 'dddddddd-bbbb-cccc-dddd-eeeeeeeeeeee' },
      type: 'page',
      timestamp: new Date().toISOString(),
    };
    const raw = JSON.stringify(body);
    const secret = process.env.NOTION_WEBHOOK_SECRET!;
    const signature = `sha256=${createHmac('sha256', secret)
      .update(raw)
      .digest('hex')}`;

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
