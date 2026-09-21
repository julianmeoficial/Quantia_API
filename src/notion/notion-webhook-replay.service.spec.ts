import { NotionWebhookReplayService } from './notion-webhook-replay.service';
import { RedisService } from '../redis/redis.service';

describe('NotionWebhookReplayService', () => {
  const set = jest.fn();
  const redis = {
    connect: jest.fn().mockResolvedValue(undefined),
    getClient: jest.fn(() => ({ set })),
  } as unknown as RedisService;

  const service = new NotionWebhookReplayService(redis);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns true when SET NX succeeds', async () => {
    set.mockResolvedValue('OK');
    await expect(service.claim('sha256=abc', 300)).resolves.toBe(true);
    expect(set).toHaveBeenCalledWith(
      expect.stringMatching(/^notion:webhook:replay:[a-f0-9]{64}$/),
      '1',
      'EX',
      300,
      'NX',
    );
  });

  it('returns false when key already exists', async () => {
    set.mockResolvedValue(null);
    await expect(service.claim('sha256=abc', 300)).resolves.toBe(false);
  });
});
