import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import type { EnvConfig } from '../config/env.schema';
import { SecurityMetricsService } from './security-metrics.service';
import { RedisService } from '../redis/redis.service';

describe('SecurityMetricsService', () => {
  it('increments Redis and warns at threshold', async () => {
    const incr = jest.fn().mockResolvedValue(50);
    const expire = jest.fn().mockResolvedValue(1);
    const redis = {
      connect: jest.fn().mockResolvedValue(undefined),
      getClient: () => ({ incr, expire }),
    } as unknown as RedisService;
    const config = {
      get: () => 50,
    } as unknown as ConfigService<EnvConfig, true>;
    const service = new SecurityMetricsService(redis, config);
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    await service.recordHttpStatus(401);
    expect(incr).toHaveBeenCalledWith('security:http:401:min');
    expect(warn).toHaveBeenCalled();

    await service.recordHttpStatus(200);
    expect(incr).toHaveBeenCalledTimes(1);

    warn.mockRestore();
  });
});
