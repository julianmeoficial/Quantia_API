import { HttpStatus } from '@nestjs/common';
import {
  LOGIN_LOCKOUT_THRESHOLDS,
  LoginLockoutService,
} from './login-lockout.service';
import { RedisService } from '../redis/redis.service';

describe('LoginLockoutService', () => {
  const store = new Map<string, { value: string; ttl?: number }>();
  const client = {
    incr: jest.fn((key: string) => {
      const current = Number(store.get(key)?.value ?? '0') + 1;
      store.set(key, { value: String(current), ttl: store.get(key)?.ttl });
      return Promise.resolve(current);
    }),
    expire: jest.fn((key: string, ttl: number) => {
      const entry = store.get(key) ?? { value: '0' };
      store.set(key, { ...entry, ttl });
      return Promise.resolve(1);
    }),
    set: jest.fn((key: string, value: string, _mode: string, ttl: number) => {
      store.set(key, { value, ttl });
      return Promise.resolve('OK');
    }),
    ttl: jest.fn((key: string) => {
      const entry = store.get(key);
      return Promise.resolve(entry ? (entry.ttl ?? -1) : -2);
    }),
    del: jest.fn((...keys: string[]) => {
      let n = 0;
      for (const key of keys) {
        if (store.delete(key)) n += 1;
      }
      return Promise.resolve(n);
    }),
  };

  const redis = {
    getClient: () => client,
    connect: jest.fn().mockResolvedValue(undefined),
  } as unknown as RedisService;

  const service = new LoginLockoutService(redis);

  beforeEach(() => {
    store.clear();
    jest.clearAllMocks();
  });

  it('throws 429 when lock key is active', async () => {
    store.set('auth:login:lock:user@test.com:1.1.1.1', {
      value: '1',
      ttl: 30,
    });

    await expect(
      service.assertNotLocked('user@test.com', '1.1.1.1'),
    ).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
      retryAfterSeconds: 30,
    });
  });

  it('does not throw when no lock is active', async () => {
    await expect(
      service.assertNotLocked('user@test.com', '1.1.1.1'),
    ).resolves.toBeUndefined();
  });

  it('locks after first threshold of failures', async () => {
    const first = LOGIN_LOCKOUT_THRESHOLDS[0];
    for (let i = 0; i < first.failures; i += 1) {
      await service.recordFailure('user@test.com', '1.1.1.1');
    }

    expect(client.set).toHaveBeenCalledWith(
      'auth:login:lock:user@test.com:1.1.1.1',
      '1',
      'EX',
      first.lockSeconds,
    );
  });

  it('clear removes fail and lock keys', async () => {
    await service.clear('User@Test.com', '1.1.1.1');
    expect(client.del).toHaveBeenCalledWith(
      'auth:login:fail:user@test.com:1.1.1.1',
      'auth:login:lock:user@test.com:1.1.1.1',
    );
  });
});
