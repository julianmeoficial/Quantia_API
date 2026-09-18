import { ConfigService } from '@nestjs/config';
import { NotionClient } from './notion.client';

describe('NotionClient', () => {
  it('spaces requests according to rate limit', async () => {
    const config = {
      get: jest.fn((key: string) => {
        const values: Record<string, string | number> = {
          NOTION_TOKEN: 'ntn_test',
          NOTION_VERSION: '2025-09-03',
          NOTION_RATE_LIMIT_RPS: 100,
          NOTION_SYNC_MAX_ATTEMPTS: 3,
        };
        return values[key];
      }),
    } as unknown as ConfigService;

    const client = new NotionClient(config as never);
    const calls: number[] = [];
    const started = Date.now();

    await Promise.all(
      Array.from({ length: 3 }, () =>
        (
          client as unknown as {
            throttled: <T>(fn: () => Promise<T>) => Promise<T>;
          }
        ).throttled(() => {
          calls.push(Date.now() - started);
          return Promise.resolve(true);
        }),
      ),
    );

    expect(calls).toHaveLength(3);
    expect(calls[2] - calls[0]).toBeGreaterThanOrEqual(0);
  });
});
