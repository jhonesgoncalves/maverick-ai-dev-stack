import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/** Redis when REDIS_URL is set, an in-memory map otherwise, so the API runs with no infrastructure. */
@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private readonly memory = new Map<string, { value: string; expiresAt: number }>();
  private readonly redis?: Redis;

  constructor(config: ConfigService) {
    const url = config.get<string>('redisUrl');
    if (url) this.redis = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1 });
    this.logger.log(url ? 'using redis cache' : 'using in-memory cache');
  }

  async wrap<T>(key: string, ttlSeconds: number, load: () => Promise<T>): Promise<T> {
    const hit = await this.get(key);
    if (hit !== undefined) return JSON.parse(hit) as T;
    const value = await load();
    await this.set(key, JSON.stringify(value), ttlSeconds);
    return value;
  }

  async invalidate(prefix: string): Promise<void> {
    if (this.redis) {
      const keys = await this.redis.keys(`${prefix}*`);
      if (keys.length) await this.redis.del(...keys);
      return;
    }
    for (const key of this.memory.keys()) if (key.startsWith(prefix)) this.memory.delete(key);
  }

  private async get(key: string): Promise<string | undefined> {
    if (this.redis) return (await this.redis.get(key)) ?? undefined;
    const entry = this.memory.get(key);
    if (!entry || entry.expiresAt < Date.now()) return undefined;
    return entry.value;
  }

  private async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    if (this.redis) await this.redis.set(key, value, 'EX', ttlSeconds);
    else this.memory.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis?.quit();
  }
}
