import { EventEmitter } from 'node:events';

export class Pool<T> extends EventEmitter {
  constructor(options: PoolOptions<T>);
  initialise() : Promise<void>;
  acquire() : Promise<T>;
  release(resource: T): void;
  destroy(resource: T): void;
  evictBadResources(): void;
  stats(): PoolStats;
  shutdown() : Promise<void>;
}

export type PoolOptions<T> = {
  factory: Factory<T>;
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
  size: number;
  idle: number;
  acquired: number;
  bad: number;
  available: number;
}

export namespace Errors {
  class XPoolError extends Error {
    static code: string;
  }
  class ConfigurationError extends XPoolError {}
  class OperationTimedout extends XPoolError {}
  class OperationFailed extends XPoolError {}
  class ResourceCreationFailed extends XPoolError {}
  class ResourceValidationFailed extends XPoolError {}
  class ResourceDestructionFailed extends XPoolError {}
}

