import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import type { EnvConfig } from '@/config/index';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;

  constructor(private readonly config: ConfigService<EnvConfig>) {
    const redisUrl = this.config.get('REDIS_URL', { infer: true });
    if (redisUrl) {
      try {
        const isTls = redisUrl.startsWith('rediss://');
        this.client = new Redis(redisUrl, {
          maxRetriesPerRequest: 3,
          lazyConnect: true,
          ...(isTls && { tls: { rejectUnauthorized: false } }),
          retryStrategy: (times) => {
            if (times > 5) return null; // Stop retrying after 5 attempts
            return Math.min(times * 200, 2000);
          },
        });
        // Prevent unhandled error crashes
        this.client.on('error', (err) => {
          this.logger.warn(`Redis error: ${err.message}`);
          if (this.client && this.client.status !== 'ready') {
            this.client.disconnect();
            this.client = null;
          }
        });
        this.client.connect().catch((err) => {
          this.logger.warn(`Redis connection failed, running without cache: ${err.message}`);
          this.client?.disconnect();
          this.client = null;
        });
        this.logger.log('Redis cache connecting...');
      } catch (err) {
        this.logger.warn(`Redis init failed: ${err instanceof Error ? err.message : err}`);
        this.client = null;
      }
    } else {
      this.logger.log('REDIS_URL not set — cache disabled (in-memory fallback)');
    }
  }

  async onModuleDestroy() {
    await this.client?.quit();
  }

  get isAvailable(): boolean {
    return this.client?.status === 'ready';
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.isAvailable) return null;
    try {
      const data = await this.client!.get(key);
      return data ? (JSON.parse(data) as T) : null;
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    if (!this.isAvailable) return;
    try {
      await this.client!.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch {
      // Silently fail — cache is best-effort
    }
  }

  async del(key: string): Promise<void> {
    if (!this.isAvailable) return;
    try {
      await this.client!.del(key);
    } catch {
      // Silently fail
    }
  }

  async invalidatePattern(pattern: string): Promise<void> {
    if (!this.isAvailable) return;
    try {
      const keys = await this.client!.keys(pattern);
      if (keys.length > 0) {
        await this.client!.del(...keys);
      }
    } catch {
      // Silently fail
    }
  }

  /** Direct access for rate limiter INCR/EXPIRE pattern */
  async incr(key: string, ttlSeconds: number): Promise<number> {
    if (!this.isAvailable) return -1;
    try {
      const count = await this.client!.incr(key);
      if (count === 1) {
        await this.client!.expire(key, ttlSeconds);
      }
      return count;
    } catch {
      return -1;
    }
  }
}
