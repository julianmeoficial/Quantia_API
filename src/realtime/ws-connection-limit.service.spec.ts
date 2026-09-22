import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../config/env.schema';
import { RedisService } from '../redis/redis.service';
import { WsConnectionLimitService } from './ws-connection-limit.service';

describe('WsConnectionLimitService', () => {
  const scard = jest.fn();
  const sadd = jest.fn();
  const srem = jest.fn();
  const del = jest.fn();
  const incr = jest.fn();
  const expire = jest.fn();

  const redis = {
    connect: jest.fn().mockResolvedValue(undefined),
    getClient: () => ({ scard, sadd, srem, del, incr, expire }),
  } as unknown as RedisService;

  const config = {
    get: (key: string) => {
      if (key === 'WS_MAX_CONNECTIONS_PER_USER') return 5;
      if (key === 'WS_MAX_EVENTS_PER_SECOND') return 30;
      return undefined;
    },
  } as unknown as ConfigService<EnvConfig, true>;

  const service = new WsConnectionLimitService(redis, config);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects when connection cap reached', async () => {
    scard.mockResolvedValue(5);
    await expect(service.tryAcquireConnection('u1', 's1')).resolves.toBe(false);
    expect(sadd).not.toHaveBeenCalled();
  });

  it('acquires when under cap', async () => {
    scard.mockResolvedValue(2);
    sadd.mockResolvedValue(1);
    expire.mockResolvedValue(1);
    await expect(service.tryAcquireConnection('u1', 's1')).resolves.toBe(true);
    expect(sadd).toHaveBeenCalledWith('ws:conn:u1', 's1');
  });

  it('rate-limits events per second', async () => {
    incr.mockResolvedValueOnce(1).mockResolvedValueOnce(31);
    expire.mockResolvedValue(1);
    await expect(service.assertEventAllowed('sock')).resolves.toBe(true);
    await expect(service.assertEventAllowed('sock')).resolves.toBe(false);
  });
});
