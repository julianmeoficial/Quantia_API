import { HealthCheckError } from '@nestjs/terminus';
import { RedisService } from '../../redis/redis.service';
import { RedisHealthIndicator } from './redis.health';

describe('RedisHealthIndicator', () => {
  it('returns up when redis responds PONG', async () => {
    const redisService = {
      ping: jest.fn().mockResolvedValue('PONG'),
    } as unknown as RedisService;

    const indicator = new RedisHealthIndicator(redisService);
    const result = await indicator.isHealthy('redis');

    expect(result.redis.status).toBe('up');
  });

  it('throws HealthCheckError when redis ping fails', async () => {
    const redisService = {
      ping: jest.fn().mockRejectedValue(new Error('Connection refused')),
    } as unknown as RedisService;

    const indicator = new RedisHealthIndicator(redisService);

    await expect(indicator.isHealthy('redis')).rejects.toBeInstanceOf(
      HealthCheckError,
    );
  });
});
