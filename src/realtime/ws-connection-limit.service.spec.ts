import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../config/env.schema';
import { RedisService } from '../redis/redis.service';
import {
  WS_CONN_STALE_MS,
  WsConnectionLimitService,
} from './ws-connection-limit.service';

describe('WsConnectionLimitService', () => {
  const wsConnAcquire = jest.fn();
  const zrem = jest.fn();
  const del = jest.fn();
  const incr = jest.fn();
  const expire = jest.fn();
  const pipeline = {
    zadd: jest.fn().mockReturnThis(),
    pexpire: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue([]),
  };

  const redis = {
    connect: jest.fn().mockResolvedValue(undefined),
    getClient: () => ({
      status: 'ready',
      defineCommand: jest.fn(),
      wsConnAcquire,
      zrem,
      del,
      incr,
      expire,
      pipeline: () => pipeline,
    }),
  } as unknown as RedisService;

  const config = {
    get: (key: string) => {
      if (key === 'WS_MAX_CONNECTIONS_PER_USER') return 10;
      if (key === 'WS_MAX_EVENTS_PER_SECOND') return 30;
      return undefined;
    },
  } as unknown as ConfigService<EnvConfig, true>;

  let service: WsConnectionLimitService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new WsConnectionLimitService(redis, config);
  });

  it('rejects when the Lua acquire reports the cap reached', async () => {
    wsConnAcquire.mockResolvedValue(0);
    await expect(service.tryAcquireConnection('u1', 's1')).resolves.toBe(false);
  });

  it('acquires under the cap with stale pruning parameters', async () => {
    wsConnAcquire.mockResolvedValue(1);
    await expect(service.tryAcquireConnection('u1', 's1')).resolves.toBe(true);
    expect(wsConnAcquire).toHaveBeenCalledWith(
      'ws:conn:v2:u1',
      's1',
      expect.any(Number),
      WS_CONN_STALE_MS,
      10,
    );
  });

  it('heartbeat refreshes only local sockets', async () => {
    wsConnAcquire.mockResolvedValue(1);
    await service.tryAcquireConnection('u1', 's1');
    await service.heartbeat();
    expect(pipeline.zadd).toHaveBeenCalledWith(
      'ws:conn:v2:u1',
      'XX',
      expect.any(Number),
      's1',
    );

    pipeline.zadd.mockClear();
    await service.releaseConnection('u1', 's1');
    await service.heartbeat();
    expect(pipeline.zadd).not.toHaveBeenCalled();
    expect(zrem).toHaveBeenCalledWith('ws:conn:v2:u1', 's1');
  });

  it('releases every local socket on shutdown', async () => {
    wsConnAcquire.mockResolvedValue(1);
    await service.tryAcquireConnection('u1', 's1');
    await service.tryAcquireConnection('u2', 's2');
    await service.onModuleDestroy();
    expect(zrem).toHaveBeenCalledWith('ws:conn:v2:u1', 's1');
    expect(zrem).toHaveBeenCalledWith('ws:conn:v2:u2', 's2');
  });

  it('rate-limits events per second', async () => {
    incr.mockResolvedValueOnce(1).mockResolvedValueOnce(31);
    expire.mockResolvedValue(1);
    await expect(service.assertEventAllowed('sock')).resolves.toBe(true);
    await expect(service.assertEventAllowed('sock')).resolves.toBe(false);
  });
});
