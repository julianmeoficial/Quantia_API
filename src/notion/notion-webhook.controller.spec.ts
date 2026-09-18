import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { NotionWebhookController } from './notion-webhook.controller';
import { NotionSyncEnqueueService } from './notion-sync-enqueue.service';

describe('NotionWebhookController', () => {
  const enqueueNotionToDb = jest.fn().mockResolvedValue(undefined);
  const enqueue = {
    enqueueNotionToDb,
  } as unknown as NotionSyncEnqueueService;

  const secret = 'whsec_test_secret';
  const config = {
    get: jest.fn(() => secret),
  } as unknown as ConfigService;

  const controller = new NotionWebhookController(enqueue, config as never);

  beforeEach(() => {
    jest.clearAllMocks();
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
      controller.handle({ entity: { id: 'page-1' } }, 'sha256=deadbeef', {
        rawBody: Buffer.from('{"entity":{"id":"page-1"}}'),
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('enqueues on valid signature', async () => {
    const body = { entity: { id: 'page-1' }, type: 'page.updated' };
    const raw = Buffer.from(JSON.stringify(body));
    const signature = `sha256=${createHmac('sha256', secret)
      .update(raw)
      .digest('hex')}`;

    const result = await controller.handle(body, signature, { rawBody: raw });
    expect(result).toEqual({ ok: true });
    expect(enqueueNotionToDb).toHaveBeenCalledWith(
      expect.objectContaining({ notionPageId: 'page-1' }),
    );
  });
});
