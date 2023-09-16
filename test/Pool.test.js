const { strictEqual: eq, deepStrictEqual: deq, ok, rejects } = require('node:assert');
const { scheduler } = require('node:timers/promises');

const { describe, it } = require('zunit');

const TestFactory = require('./lib/TestFactory');

const { Pool } = require('..');

describe('Pool', () => {

  describe('acquire', () => {

    it('should create resources when the pool is empty', async () => {
      const factory = new TestFactory(['R1']);
      const pool = createPool({ factory });

      const resource = await pool.acquire();
      eq(resource, 'R1');
    });

    it('should re-issue idle resources released back to the pool', async () => {
      const factory = new TestFactory(['R1']);
      const pool = createPool({ factory });

      const resource1 = await pool.acquire();
      pool.release(resource1);

      const resource2 = await pool.acquire();
      eq(resource2, 'R1');
    });

    it('should create resources when all idle resources are in use providing there is still spare capacity', async () => {
      const factory = new TestFactory(['R1', 'R2']);
      const pool = createPool({ factory });

      const resource1 = await pool.acquire();
      const resource2 = await pool.acquire();

      eq(resource1, 'R1');
      eq(resource2, 'R2');
    });

    it('should queue requests until idle resources become available when there is no spare capacity', async () => {
      const factory = new TestFactory(['R1']);
      const pool = createPool({ factory, maxSize: 1 });

      const resource1 = await pool.acquire();
      setTimeout(() => pool.release(resource1), 100);

      const before = Date.now();
      const resource2 = await pool.acquire();
      const after = Date.now();

      eq(resource2, 'R1');
      ok(after - before >= 95, `Only waited ${after - before}ms before acquiring resource`);
    });

    describe('errors', () => {
      it('should doggedly attempt to acquire resources in the face of creation errors', async () => {
        const factory = new TestFactory([{ createError: true }, { createError: true }, 'R3']);
        const pool = createPool({ factory });

        const resource = await pool.acquire();
        eq(resource, 'R3');
      });

      it('should doggedly attempt to acquire resources in the face of validation errors', async () => {
        const factory = new TestFactory([{ validateError: true }, { validateError: true }, 'R3']);
        const pool = createPool({ factory });

        const resource = await pool.acquire();
        eq(resource, 'R3');
      });

      it('should delay retrying acquisition for a short period of time to prevent high CPU', async () => {
        const factory = new TestFactory([{ createError: true }, { createError: true }, 'R3']);
        const pool = createPool({ factory, acquireRetryInterval: 200 });

        const before = Date.now();
        await pool.acquire();
        const after = Date.now();

        ok(after - before >= 400, `Only waited ${after - before}ms before retrying resource acquisition`);
      });
    });

    describe('timeouts', () => {
      it('should reject acquisitions that take too long to create resources', async () => {
        const factory = new TestFactory([{ createDelay: 200, value: 'R1' }]);
        const pool = createPool({ factory, acquireTimeout: 100 });

        const before = Date.now();
        await rejects(() => pool.acquire(), (err) => {
          eq(err.code, Pool.Events.ERR_ACQUIRE_TIMEDOUT);
          eq(err.message, 'Acquire timedout after 100ms');
          return true;
        });
        const after = Date.now();

        ok(after - before >= 95, `Only waited ${after - before}ms for resource acquisition`);
      });

      it('should reject acquisitions that take too long to validate created resources', async () => {
        const factory = new TestFactory([{ validateDelay: 200, value: 'R1' }]);
        const pool = createPool({ factory, acquireTimeout: 100 });

        const before = Date.now();
        await rejects(() => pool.acquire(), (err) => {
          eq(err.code, Pool.Events.ERR_ACQUIRE_TIMEDOUT);
          eq(err.message, 'Acquire timedout after 100ms');
          return true;
        });
        const after = Date.now();

        ok(after - before >= 95, `Only waited ${after - before}ms for resource acquisition`);
      });

      it('should reject acquisitions which take too long to validate idle resources', async () => {
        const factory = new TestFactory([{ validateDelay: 200, value: 'R1' }]);
        const pool = createPool({ factory, maxSize: 1, acquireTimeout: 100 });

        await rejects(() => pool.acquire(), (err) => {
          eq(err.code, Pool.Events.ERR_ACQUIRE_TIMEDOUT);
          return true;
        });

        // Should eventually validate successfully and become idle
        await scheduler.wait(100);

        const before = Date.now();
        await rejects(() => pool.acquire(), (err) => {
          eq(err.code, Pool.Events.ERR_ACQUIRE_TIMEDOUT);
          eq(err.message, 'Acquire timedout after 100ms');
          return true;
        });
        const after = Date.now();

        ok(after - before >= 95, `Only waited ${after - before}ms for resource acquisition`);
      });

      it('should add late resources to the idle pool when they eventually resolve', async () => {
        const factory = new TestFactory([{ createDelay: 200, value: 'R1' }]);
        const pool = createPool({ factory, maxSize: 1, acquireTimeout: 100 });

        await rejects(() => pool.acquire(), (err) => {
          eq(err.code, Pool.Events.ERR_ACQUIRE_TIMEDOUT);
          eq(err.message, 'Acquire timedout after 100ms');
          return true;
        });

        // Should eventually validate successfully and become idle
        await scheduler.wait(100);

        const resource = await pool.acquire();
        eq(resource, 'R1');
      });
    });
  });

  describe('release', () => {
    it('should tolerate unknown resources', () => {
      const pool = createPool({ factory: new TestFactory() });
      pool.release('wibble');
    });

    it('should tolerate repeated releases', async () => {
      const factory = new TestFactory(['R1']);
      const pool = createPool({ factory });

      const resource1 = await pool.acquire();
      pool.release(resource1);
      pool.release(resource1);

      const resource2 = await pool.acquire();
      eq(resource2, 'R1');
    });

    it('should check acquisition queue after releasing a resource', async () => {
      const factory = new TestFactory(['R1']);
      const pool = createPool({ factory });

      const resource1 = await pool.acquire();
      setTimeout(() => pool.release(resource1), 100);

      const resource2 = await pool.acquire();
      eq(resource2, 'R1');
    });
  });

  describe('with', () => {
    it('should execute supplied function with a resource', async () => {
      const factory = new TestFactory(['R1']);
      const pool = createPool({ factory });

      const result = await pool.with((resource) => {
        eq(resource, 'R1');
        return 'OK';
      });

      eq(result, 'OK');
    });

    it('should automatically release the resource after the function completes', async () => {
      const factory = new TestFactory(['R1', 'R2']);
      const pool = createPool({ factory });

      await pool.with(async (resource1) => {
        eq(resource1, 'R1');

        const resource2 = await pool.acquire();
        eq(resource2, 'R2');
      });

      const resource3 = await pool.acquire();
      eq(resource3, 'R1');
    });
  });

  describe('destroy', () => {
    it('should destroy the resource', async () => {
      const factory = new TestFactory(['R1']);
      const pool = createPool({ factory });

      const resource = await pool.acquire();
      await pool.destroy(resource);

      ok(factory.wasDestroyed(resource), `Resource ${resource} was not destroyed`);
    });

    it('should tolerate unknown resources', async () => {
      const pool = createPool({ factory: new TestFactory() });
      await pool.destroy('wibble');
    });

    it('should tolerate repeated destroys', async () => {
      const factory = new TestFactory(['R1']);
      const pool = createPool({ factory });

      const resource = await pool.acquire();
      await Promise.all([pool.destroy(resource), pool.destroy(resource)]);

      ok(factory.wasDestroyed(resource), `Resource ${resource} was not destroyed`);
    });

    it('should check acquisition queue after destroying a resource', async () => {
      const factory = new TestFactory(['R1', 'R2']);
      const pool = createPool({ factory });

      const resource1 = await pool.acquire();
      setTimeout(() => pool.destroy(resource1), 100);

      const resource2 = await pool.acquire();
      eq(resource2, 'R2');
    });

    it('should free up pool capacity', async () => {
      const factory = new TestFactory(['R1', 'R2']);
      const pool = createPool({ factory, maxSize: 1 });

      const resource1 = await pool.acquire();
      await pool.destroy(resource1);

      const resource2 = await pool.acquire();
      eq(resource2, 'R2');
    });

    describe('errors', () => {
      it('should reject with underlying cause if the destroy fails', async () => {
        const factory = new TestFactory([{ destroyError: 'Oh Noes!', value: 'R1' }]);
        const pool = createPool({ factory });

        const resource = await pool.acquire();

        await rejects(() => pool.destroy(resource), (err) => {
          eq(err.code, Pool.Events.ERR_DESTROY_FAILED);
          eq(err.message, 'Destroy failed: Oh Noes!');
          eq(err.cause?.message, 'Oh Noes!');
          return true;
        });
      });

      it('should continue to use up pool capacity after failing to destroy a resource', async () => {
        const factory = new TestFactory([{ destroyError: true, value: 'R1' }, 'R2']);
        const pool = createPool({ factory, acquireTimeout: 100, maxSize: 1 });

        const resource = await pool.acquire();

        await rejects(() => pool.destroy(resource), (err) => {
          eq(err.code, Pool.Events.ERR_DESTROY_FAILED);
          return true;
        });

        await rejects(() => pool.acquire(), (err) => {
          eq(err.code, Pool.Events.ERR_ACQUIRE_TIMEDOUT);
          return true;
        });
      });
    });

    describe('timeouts', () => {
      it('should reject resource destruction that takes too long', async () => {
        const factory = new TestFactory([{ destroyDelay: 200, value: 'R1' }]);
        const pool = createPool({ factory, destroyTimeout: 100 });

        const resource = await pool.acquire();

        const before = Date.now();
        await rejects(() => pool.destroy(resource), (err) => {
          eq(err.code, Pool.Events.ERR_DESTROY_TIMEDOUT);
          eq(err.message, 'Destroy timedout after 100ms');
          return true;
        });
        const after = Date.now();

        ok(after - before >= 95, `Only waited ${after - before}ms for resource destruction`);
      });

      it('should continue taking up pool capacity after resource destruction times out', async () => {
        const factory = new TestFactory([{ destroyDelay: 500, value: 'R1' }, 'R2']);
        const pool = createPool({ factory, maxSize: 1, acquireTimeout: 100, destroyTimeout: 100 });

        const resource = await pool.acquire();

        await rejects(() => pool.destroy(resource), (err) => {
          eq(err.code, Pool.Events.ERR_DESTROY_TIMEDOUT);
          return true;
        });

        await rejects(() => pool.acquire(resource), (err) => {
          eq(err.code, Pool.Events.ERR_ACQUIRE_TIMEDOUT);
          return true;
        });
      });

      it('should free up pool capacity when resource destruction eventually completes', async () => {
        const factory = new TestFactory([{ destroyDelay: 200, value: 'R1' }, 'R2']);
        const pool = createPool({ factory, maxSize: 1, acquireTimeout: 100, destroyTimeout: 100 });

        const resource1 = await pool.acquire();

        await rejects(() => pool.destroy(resource1), (err) => {
          eq(err.code, Pool.Events.ERR_DESTROY_TIMEDOUT);
          return true;
        });

        // Should eventually destroy successfully and free capacity
        await scheduler.wait(100);

        const resource2 = await pool.acquire();
        eq(resource2, 'R2');
      });
    });
  });

  describe('evictQuarantinedResources', () => {

    it('should not evict idle resources', async () => {
      const factory = new TestFactory(['R1']);
      const pool = createPool({ factory });

      const resource = await pool.acquire();
      pool.release(resource);

      eq(pool.stats().idle, 1);
      await pool.evictQuarantinedResources();
      eq(pool.stats().idle, 1);
    });

    it('should not evict acquired resources', async () => {
      const factory = new TestFactory(['R1']);
      const pool = createPool({ factory });

      await pool.acquire();

      eq(pool.stats().acquired, 1);
      await pool.evictQuarantinedResources();
      eq(pool.stats().acquired, 1);
    });
  });

  describe('shutdown', () => {

    it('should destroy idle resources', async () => {
      const factory = new TestFactory([{ destroyDelay: 100, value: 'R1' }]);
      const pool = createPool({ factory });
      const resource = await pool.acquire();
      pool.release(resource);

      eq(pool.stats().idle, 1);
      await pool.shutdown();
      eq(pool.stats().idle, 0);

      ok(factory.wasDestroyed(resource), `Resource ${resource} was not destroyed`);
    });

    it('should evict quarantined resources', async () => {
      const factory = new TestFactory([{ destroyError: true, value: 'R1' }]);
      const pool = createPool({ factory });

      const resource = await pool.acquire();
      await rejects(() => pool.destroy(resource), (err) => {
        eq(err.code, Pool.Events.ERR_DESTROY_FAILED);
        return true;
      });

      eq(pool.stats().quarantined, 1);
      await pool.shutdown();
      eq(pool.stats().quarantined, 0);
    });

    it('should tolerate repeated calls to shutdown', async () => {
      const factory = new TestFactory(['R1']);
      const pool = createPool({ factory });

      const shutdown1 = pool.shutdown();
      const shutdown2 = pool.shutdown();

      await Promise.all([shutdown1, shutdown2]);
    });

    it('should reject subsequent acquisition requests', async () => {
      const factory = new TestFactory(['R1']);
      const pool = createPool({ factory });

      const shutdown = pool.shutdown();

      await rejects(() => pool.acquire(), (err) => {
        eq(err.code, Pool.Events.ERR_SHUTDOWN_REQUESTED);
        eq(err.message, 'Shutdown requested');
        return true;
      });

      await shutdown;
    });

    it('should wait for queued acquisition requests to complete and be released', async () => {
      const factory = new TestFactory(['R1']);
      const pool = createPool({ factory, maxSize: 1 });

      // Block the queue for 100ms
      const resource1 = await pool.acquire();
      setTimeout(() => pool.release(resource1), 100);

      // Add a request to the queue
      pool.acquire().then((resource2) => pool.release(resource2));

      const before = Date.now();
      await pool.shutdown();
      const after = Date.now();

      ok(after - before >= 95, `Only waited ${after - before}ms for queued acqusition requests to complete`);
    });

    it('should wait for acquiring resources to complete and be released', async (t, done) => {
      const factory = new TestFactory([{ createDelay: 200, value: 'R1' }]);
      const pool = createPool({ factory });

      // Add a request to the queue, which will take 200ms to acquire due to the create delay
      pool.acquire().then((resource) => pool.release(resource));

      // Call shutdown in 100ms, i.e. while the resource is still acquiring
      setTimeout(async () => {
        const before = Date.now();
        await pool.shutdown();
        const after = Date.now();
        ok(after - before >= 95, `Only waited ${after - before}ms for resource to be released`);
        done();
      }, 100);
    });

    it('should wait for idle resources to be destroyed', async () => {
      const factory = new TestFactory([{ destroyDelay: 100, value: 'R1' }]);
      const pool = createPool({ factory });
      const resource = await pool.acquire();
      pool.release(resource);

      const before = Date.now();
      await pool.shutdown();
      const after = Date.now();

      ok(after - before >= 95, `Only waited ${after - before}ms for resource to be released`);
    });

    it('should wait for acquired resources to be released', async () => {
      const factory = new TestFactory(['R1']);
      const pool = createPool({ factory });
      const resource = await pool.acquire();

      setTimeout(() => pool.release(resource), 100);
      const before = Date.now();
      await pool.shutdown();
      const after = Date.now();

      ok(after - before >= 95, `Only waited ${after - before}ms for resource to be released`);
    });

    it('should wait for acquired resources to be destroyed', async () => {
      const factory = new TestFactory(['R1']);
      const pool = createPool({ factory });
      const resource = await pool.acquire();

      setTimeout(() => pool.destroy(resource), 100);
      const before = Date.now();
      await pool.shutdown();
      const after = Date.now();

      ok(after - before >= 95, `Only waited ${after - before}ms for resource to be destroyed`);
    });

    describe('errors', () => {

      it('should reject with cause when an idle resource failed to be destroyed', async () => {
        const factory = new TestFactory([{ destroyError: 'Oh Noes!', value: 'R1' }]);
        const pool = createPool({ factory });
        const resource = await pool.acquire();
        pool.release(resource);

        await rejects(() => pool.shutdown(), (err) => {
          eq(err.code, Pool.Events.ERR_SHUTDOWN_FAILED);
          eq(err.message, 'Shutdown failed: Oh Noes!');
          eq(err.cause.message, 'Oh Noes!');
          return true;
        });
      });
    });

    describe('timeouts', () => {
      it('should reject shutdown that takes too long', async () => {
        const factory = new TestFactory(['R1']);
        const pool = createPool({ factory, shutdownTimeout: 100 });

        await pool.acquire();

        const before = Date.now();
        await rejects(() => pool.shutdown(), (err) => {
          eq(err.code, Pool.Events.ERR_SHUTDOWN_TIMEDOUT);
          eq(err.message, 'Shutdown timedout after 100ms');
          return true;
        });
        const after = Date.now();

        ok(after - before >= 95, `Only waited ${after - before}ms for shutdown`);
      });
    });
  });

  describe('stats', () => {
    it('should reflect empty pool', () => {
      const factory = new TestFactory();
      const pool = createPool({ factory });

      const stats = pool.stats();

      deq(stats, { queued: 0, acquiring: 0, creating: 0, validating: 0, idle: 0, acquired: 0, destroying: 0, quarantined: 0 });
    });

    it('should track queued acquistion requests', async () => {
      const factory = new TestFactory(['R1', 'R2']);
      const pool = createPool({ factory, maxSize: 1 });

      await pool.acquire();
      pool.acquire();

      const stats = pool.stats();

      deq(stats, { queued: 1, acquiring: 0, creating: 0, validating: 0, idle: 0, acquired: 1, destroying: 0, quarantined: 0 });
    });

    it('should track resource creation', async (t, done) => {
      const factory = new TestFactory([{ createDelay: 200, value: 'R1' }]);
      const pool = createPool({ factory, maxSize: 1 });

      pool.acquire();

      setTimeout(() => {
        const stats = pool.stats();
        deq(stats, { queued: 0, acquiring: 0, creating: 1, validating: 0, idle: 0, acquired: 0, destroying: 0, quarantined: 0 });
        done();
      }, 100);
    });

    it('should track resource validation', async (t, done) => {
      const factory = new TestFactory([{ validateDelay: 200, value: 'R1' }]);
      const pool = createPool({ factory, maxSize: 1 });

      pool.acquire();

      setTimeout(() => {
        const stats = pool.stats();
        deq(stats, { queued: 0, acquiring: 0, creating: 0, validating: 1, idle: 0, acquired: 0, destroying: 0, quarantined: 0 });
        done();
      }, 100);
    });

    it('should track idle resources', async () => {
      const factory = new TestFactory([{ validateDelay: 200, value: 'R1' }]);
      const pool = createPool({ factory, maxSize: 1 });

      const resource = await pool.acquire();
      pool.release(resource);

      const stats = pool.stats();
      deq(stats, { queued: 0, acquiring: 0, creating: 0, validating: 0, idle: 1, acquired: 0, destroying: 0, quarantined: 0 });
    });

    it('should track acquired resources', async () => {
      const factory = new TestFactory([{ validateDelay: 200, value: 'R1' }]);
      const pool = createPool({ factory, maxSize: 1 });

      await pool.acquire();

      const stats = pool.stats();
      deq(stats, { queued: 0, acquiring: 0, creating: 0, validating: 0, idle: 0, acquired: 1, destroying: 0, quarantined: 0 });
    });

    it('should track resource destruction', async (t, done) => {
      const factory = new TestFactory([{ destroyDelay: 200, value: 'R1' }]);
      const pool = createPool({ factory, maxSize: 1 });

      const resource = await pool.acquire();
      pool.destroy(resource);

      setTimeout(() => {
        const stats = pool.stats();
        deq(stats, { queued: 0, acquiring: 0, creating: 0, validating: 0, idle: 0, acquired: 0, destroying: 1, quarantined: 0 });
        done();
      }, 100);
    });

    it('should track resource quarantine', async (t, done) => {
      const factory = new TestFactory([{ destroyError: true, value: 'R1' }]);
      const pool = createPool({ factory, maxSize: 1 });

      const resource = await pool.acquire();
      await rejects(() => pool.destroy(resource), (err) => {
        eq(err.code, Pool.Events.ERR_DESTROY_FAILED);
        return true;
      });

      setTimeout(() => {
        const stats = pool.stats();
        deq(stats, { queued: 0, acquiring: 0, creating: 0, validating: 0, idle: 0, acquired: 0, destroying: 0, quarantined: 1 });
        done();
      }, 100);
    });
  });

  function createPool({ factory, maxSize, acquireTimeout = 1000, acquireRetryInterval = 100, destroyTimeout = 1000, shutdownTimeout = 1000 }) {
    return new Pool({ factory, maxSize, acquireTimeout, acquireRetryInterval, destroyTimeout, shutdownTimeout });
  }
});
