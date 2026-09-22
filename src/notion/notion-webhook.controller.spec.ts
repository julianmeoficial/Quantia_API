import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { NotionWebhookController } from './notion-webhook.controller';
import { NotionSyncEnqueueService } from './notion-sync-enqueue.service';
import { NotionWebhookReplayService } from './notion-webhook-replay.service';

describe('NotionWebhookController', () => {
  const enqueueNotionToDb = jest.fn().mockResolvedValue(undefined);
  const enqueue = {
    enqueueNotionToDb,
  } as unknown as NotionSyncEnqueueService;

  const secret = 'whsec_test_secret';
  const skew = 300;
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'NOTION_WEBHOOK_SECRET') return secret;
      if (key === 'NOTION_WEBHOOK_MAX_SKEW_SECONDS') return skew;
      return undefined;
    }),
  } as unknown as ConfigService;

  const claim = jest.fn().mockResolvedValue(true);
  const replay = { claim } as unknown as NotionWebhookReplayService;
  const audit = { log: jest.fn().mockResolvedValue(undefined) };

  const controller = new NotionWebhookController(
    enqueue,
    config as never,
    replay,
    audit as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    claim.mockResolvedValue(true);
  });

  it('returns verification_token without signature', async () => {
    const result = await controller.handle(
      { verification_token: 'tok-123' },
      undefined,
      {},
    );
    expect(result).toEqual({ verification_token: 'tok-123' });
  });

  it('rejects invalid signature', async () => {
    await expect(
      controller.handle(
        {
          entity: { id: 'page-1' },
          timestamp: new Date().toISOString(),
        },
        'sha256=deadbeef',
        {
          rawBody: Buffer.from(
            JSON.stringify({
              entity: { id: 'page-1' },
              timestamp: new Date().toISOString(),
            }),
          ),
        },
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects missing timestamp', async () => {
    const body = { entity: { id: 'page-1' }, type: 'page.updated' };
    const raw = Buffer.from(JSON.stringify(body));
    const signature = `sha256=${createHmac('sha256', secret)
      .update(raw)
      .digest('hex')}`;

    await expect(
      controller.handle(body, signature, { rawBody: raw }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects out-of-window timestamp', async () => {
    const body = {
      entity: { id: 'page-1' },
      type: 'page.updated',
      timestamp: new Date(Date.now() - 600_000).toISOString(),
    };
    const raw = Buffer.from(JSON.stringify(body));
    const signature = `sha256=${createHmac('sha256', secret)
      .update(raw)
      .digest('hex')}`;

    await expect(
      controller.handle(body, signature, { rawBody: raw }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects replayed signature', async () => {
    claim.mockResolvedValueOnce(false);
    const body = {
      entity: { id: 'page-1' },
      type: 'page.updated',
      timestamp: new Date().toISOString(),
    };
    const raw = Buffer.from(JSON.stringify(body));
    const signature = `sha256=${createHmac('sha256', secret)
      .update(raw)
      .digest('hex')}`;

    await expect(
      controller.handle(body, signature, { rawBody: raw }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('enqueues on valid signature', async () => {
    const body = {
      entity: { id: 'page-1' },
      type: 'page.updated',
      timestamp: new Date().toISOString(),
    };
    const raw = Buffer.from(JSON.stringify(body));
    const signature = `sha256=${createHmac('sha256', secret)
      .update(raw)
      .digest('hex')}`;

    const result = await controller.handle(body, signature, { rawBody: raw });
    expect(result).toEqual({ ok: true });
    expect(enqueueNotionToDb).toHaveBeenCalledWith(
      expect.objectContaining({ notionPageId: 'page-1' }),
    );
    expect(claim).toHaveBeenCalledWith(signature, skew);
  });
});
