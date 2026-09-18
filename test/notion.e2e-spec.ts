import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { createHmac } from 'crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { NotionSyncEnqueueService } from '../src/notion/notion-sync-enqueue.service';

describe('Notion webhooks (e2e)', () => {
  let app: INestApplication<App>;
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
  });

  afterAll(async () => {
    await app.close();
  });

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
      .send({ entity: { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' } })
      .expect(401);
  });

  it('accepts signed events and enqueues', async () => {
    const body = {
      entity: { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' },
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

    expect(enqueueNotionToDb).toHaveBeenCalled();
  });
});
