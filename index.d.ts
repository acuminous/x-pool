import { EventEmitter } from 'node:events';

export class Pool<T> extends EventEmitter {
  constructor(options: PoolOptions<T>);
  initialise() : Promise<void>;
  with(fn: (resource: T) => Promise<any>) : Promise<any>;
  acquire() : Promise<T>;
  release(resource: T): void;
  destroy(resource: T): Promise<void>;
  evictBadResources(): void;
  stats(): PoolStats;
  shutdown() : Promise<void>;
}

export type PoolOptions<T> = {
  factory: Factory<T>;
  autoStart?: boolean;
  minSize?: number;
  maxSize?: number;
  acquireTimeout: number;
  acquireRetryInterval?: number;
  destroyTimeout: number;
  initialiseTimeout?: number;
  shutdownTimeout?: number;
}

export interface Factory<T> {
  create(pool: Pool<T>): Promise<T>;
  validate(resource: T): Promise<void>;
  destroy(resource: T): Promise<void>;
}

export type PoolStats = {
  queued: number;
  acquiring: number;
  acquired: number;
  idle: number;
  quarantined: number;
  available: number;
  size: number;
  peak: number;
}
