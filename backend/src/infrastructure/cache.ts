import { logger } from "./logger";
import { getRedis } from "./redis";

export async function getOrSetJson<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
  const redis = getRedis();
  try {
    const cached = await redis.get(key);
    if (cached) {
      return JSON.parse(cached) as T;
    }
  } catch (err) {
    logger.warn({ err, key }, "cache read failed; loading from database");
  }

  const value = await loader();
  try {
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch (err) {
    logger.warn({ err, key }, "cache write failed");
  }
  return value;
}

export async function incrementCacheVersion(name: string): Promise<void> {
  try {
    await getRedis().incr(`cache:version:${name}`);
  } catch (err) {
    logger.warn({ err, name }, "cache version increment failed");
  }
}

export async function readCacheVersion(name: string): Promise<string> {
  try {
    return (await getRedis().get(`cache:version:${name}`)) ?? "0";
  } catch (err) {
    logger.warn({ err, name }, "cache version read failed");
    return "0";
  }
}
