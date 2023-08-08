export class Pool<T> {
  constructor(options: PoolOptions);
  acquire() : Promise<T>;
  release(resource: <T>): void;
  destroy(resource: <T>): void;
  evictBadResources(): void;
  stats(): PoolStats;
};

export type PoolOptions {
  factory: Factory;
  minSize?: number;
  maxSize?: number;
  acquireTimeout: number;
  acquireRetryInterval?: number;
  destroyTimeout: number;
  initialiseTimeout?: number;
  shutdownTimeout?: number;
};

export type Factory<T> {
  create(pool: Pool<T>): Promise<T>;
  validate(resource: T): Promise<void>;
  destroy(resource: T): Promise<void>;
};

export type PoolStats {
  size: number;
  idle: number;
  acquired: number;
  bad: number;
  available: number;
};