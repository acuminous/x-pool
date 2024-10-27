const { describe, it } = require('zunit');
const { ok, deepStrictEqual: eq, rejects } = require('node:assert');
const { Pool } = require('..');
const AsyncLatch = require('../lib/utils/AsyncLatch');
const TestFactory = require('./lib/TestFactory')
const { takesAtLeast: tmin } = require('./lib/custom-assertions');


describe('Pool', () => {

  describe('configuration', () => {
    it('validates min and max pool size')
  })

  describe('events', () => {
    it('should report errors thrown in custom resource handlers', async (t, done) => {
      const factory = new TestFactory([{ resource: 1 }])
      const pool = new Pool({ factory, minSize: 1 });

      pool.on('resource_created', () => {
        throw new Error('Oh Noes!');
      });

      pool.on('error', (err) => {
        eq(err.message, "Custom event handlers must not throw errors; however, an error was thrown by a handler listening to 'resource_created' events");
        eq(err.cause.message, 'Oh Noes!');
        done();
      });

      await pool.start();
    });
  })

  describe('start', () => {

    it('should create the minimum number of resources', async () => {
      const factory = new TestFactory([{ resource: 1 }, { resource: 2 }, { resource: 3 }])
      const pool = new Pool({ factory, minSize: 2 });

      await pool.start();

      eq(pool.stats(), { queued:0, initialising: 0, idle:2, busy:0, destroying:0, segregated:0, size: 2 });
    });

    it('should tolerate errors creating resources', async () => {
      const factory = new TestFactory([{ resource: 1 }, { createError: 'Oh Noes!' }, { resource: 3 }, { resource: 4 }])
      const pool = new Pool({ factory, minSize: 2 });

      await pool.start();

      eq(pool.stats(), { queued:0, initialising: 0, idle:2, busy:0, destroying:0, segregated:0, size: 2 });
    });

    it('should report errors creating resources', async (t, done) => {
      const factory = new TestFactory([{ resource: 1 }, { createError: 'Oh Noes!' }, { resource: 3 }, { resource: 4 }])
      const pool = new Pool({ factory, minSize: 2 });
      const latch = new AsyncLatch();

      pool.on('resource_creation_error', async (err) => {
        eq(err.message, 'Oh Noes!');
        latch.block();
        done();
      });

      await pool.start();

      latch.release();
    });

    it('should default to zero minimum resources', async () => {
      const factory = new TestFactory([{ resource: 1 }, { resource: 2 }, { resource: 3 }])
      const pool = new Pool({ factory });

      await pool.start();

      eq(pool.stats(), { queued:0, initialising: 0, idle:0, busy:0, destroying:0, segregated:0, size: 0 });
    });

    it('should fail if the pool has already been started', async () => {
      const factory = new TestFactory()
      const pool = new Pool({ factory });
      await pool.start();

      await rejects(() => pool.start(), (err) => {
        eq(err.message, 'The pool has already been started');
        return true;
      });
    });

    it('should fail if the pool has been stopped', async () => {
      const factory = new TestFactory()
      const pool = new Pool({ factory });

      await pool.stop();

      await rejects(() => pool.start(), (err) => {
        eq(err.message, 'The pool has been stopped');
        return true;
      });
    });

    it('should fail if the start times out', async () => {
      const factory = new TestFactory([{ resource: 1, createDelay: 200 }])
      const pool = new Pool({ factory, minSize: 1, startTimeout: 100 });

      await rejects(() => pool.start(), (err) => {
        eq(err.message, 'Failed to start pool within 100ms');
        return true;
      });

      await new Promise((resolve) => {
        setTimeout(resolve, 200)
      })

    });
  });

  describe('stop', () => {
    it('should wait for the pool to finish initialising', async () => {
      const factory = new TestFactory([{ resource: 1, createDelay: 100 }, { resource: 2, createDelay: 100 }, { resource: 3, createDelay: 100 }]);
      const pool = new Pool({ factory, minSize: 3 });

      pool.start();
      await pool.stop();

      eq(pool.stats(), { queued:0, initialising: 0, idle:0, busy:0, destroying:0, segregated:0, size: 0 });
    });

    it('should fail new acquisition requests', async () => {
      const factory = new TestFactory([{ resource: 1 }]);
      const pool = new Pool({ factory });

      await pool.start();
      await pool.stop();

      await rejects(pool.acquire(), (err) => {
        eq(err.message, 'The pool has been stopped');
        return true;
      });

      eq(pool.stats(), { queued:0, initialising: 0, idle:0, busy:0, destroying:0, segregated:0, size: 0 });
    });

    it('should destroy idle resources', async () => {
      const factory = new TestFactory([{ resource: 1 }, { resource: 2 }, { resource: 3 }]);
      const pool = new Pool({ factory, minSize: 3 });

      await pool.start();
      await pool.stop();

      eq(pool.stats(), { queued:0, initialising: 0, idle:0, busy:0, destroying:0, segregated:0, size: 0 });
    });

    it('should wait for queued acquisition requests to be fullfilled and subsequently released', async () => {
      const factory = new TestFactory([{ resource: 1 }]);
      const pool = new Pool({ factory, maxSize: 1 });

      await pool.start();
      const resource = await pool.acquire();
      pool.acquire();
      setTimeout(() => pool.release(resource), 100);
      setTimeout(() => pool.release(resource), 200);

      await tmin(async () => {
        await pool.stop();
      }, 200);

      eq(pool.stats(), { queued:0, initialising: 0, idle:0, busy:0, destroying:0, segregated:0, size: 0 });
    });

    it('should wait for acquired resources to be released and destroyed', async () => {
      const factory = new TestFactory([{ resource: 1 }]);
      const pool = new Pool({ factory });

      await pool.start();
      const resource = await pool.acquire();

      await tmin(async () => {
        setTimeout(() => pool.release(resource), 100);
        await pool.stop();
      }, 100);

      eq(pool.stats(), { queued:0, initialising: 0, idle:0, busy:0, destroying:0, segregated:0, size: 0 });
    });

    it('should evict resources that timeout while being destroyed', async () => {
      const factory = new TestFactory([{ resource: 1, destroyDelay: 200 }]);
      const pool = new Pool({ factory, minSize: 1, destroyTimeout: 100 });

      await pool.start();
      await pool.stop();

      eq(pool.stats(), { queued:0, initialising: 0, idle:0, busy:0, destroying:0, segregated:0, size: 0 });
    });

    it('should evict resources that error while being destroyed', async () => {
      const factory = new TestFactory([{ resource: 1, destroyError: 'Oh Noes!' }]);
      const pool = new Pool({ factory, minSize: 1 });

      await pool.start();
      await pool.stop();

      eq(pool.stats(), { queued:0, initialising: 0, idle:0, busy:0, destroying:0, segregated:0, size: 0 });
    });

    it('should evict previously segregated resources', async (t, done) => {
      const factory = new TestFactory([{ resource: 1, createDelay: 200, destroyDelay: 200 }, { resource: 2 }]);
      const pool = new Pool({ factory, minSize: 1, createTimeout: 100, destroyTimeout: 100 });

      await pool.start();

      pool.on('resource_segregated', async () => {
        await pool.stop();
        eq(pool.stats(), { queued:0, initialising: 0, idle:0, busy:0, destroying:0, segregated:0, size: 0 });
        done();
      })
    });

    it('should tolerate stopping a pool that has not been started', async () => {
      const factory = new TestFactory();
      const pool = new Pool({ factory });

      await pool.stop();

      eq(pool.stats(), { queued:0, initialising: 0, idle:0, busy:0, destroying:0, segregated:0, size: 0 });
    });

    it('should tolerate stopping a pool that has already been stopped', async () => {
      const factory = new TestFactory();
      const pool = new Pool({ factory });

      await pool.start();
      await pool.stop();
      await pool.stop();

      eq(pool.stats(), { queued:0, initialising: 0, idle:0, busy:0, destroying:0, segregated:0, size: 0 });
    });

    it('should block subsequent calls to stop until the pool has stopped', async () => {
      const factory = new TestFactory([{ resource: 1, destroyDelay: 100 }]);
      const pool = new Pool({ factory, minSize: 1 });
      await pool.start();

      await tmin(async () => {
        pool.stop();
        await pool.stop();
      }, 100)

      eq(pool.stats(), { queued:0, initialising: 0, idle:0, busy:0, destroying:0, segregated:0, size: 0 });
    });

    it('should fail if the stop times out', async () => {
      const factory = new TestFactory([{ resource: 1, destroyDelay: 200 }]);
      const pool = new Pool({ factory, minSize: 1, stopTimeout: 100 });

      await pool.start();
      await rejects(() => pool.stop(), (err) => {
        eq(err.message, 'Failed to stop pool within 100ms')
        return true;
      });

      eq(pool.stats(), { queued:0, initialising: 0, idle:0, busy:0, destroying:1, segregated:0, size: 1 });
    })
  });

  describe('acquire', () => {

    it('should use an idle resource if one is available', async () => {
      const factory = new TestFactory([{ resource: 1 }])
      const pool = new Pool({ factory, minSize: 1 });
      await pool.start();

      const resource = await pool.acquire();
      eq(resource, 1);

      eq(pool.stats(), { queued:0, initialising: 0, idle:0, busy:1, destroying:0, segregated:0, size: 1 });
    });

    it('should create a resource if the pool is empty', async () => {
      const factory = new TestFactory([{ resource: 1 }])
      const pool = new Pool({ factory });

      const resource = await pool.acquire();

      eq(resource, 1);

      eq(pool.stats(), { queued:0, initialising: 0, idle:0, busy:1, destroying:0, segregated:0, size: 1 });
    });

    it('should create a resource if all resources are busy', async () => {
      const factory = new TestFactory([{ resource: 1 }, { resource: 2 }])
      const pool = new Pool({ factory });

      const resource1 = await pool.acquire();
      eq(resource1, 1);

      const resource2 = await pool.acquire();
      eq(resource2, 2);

      eq(pool.stats(), { queued:0, initialising: 0, idle:0, busy:2, destroying:0, segregated:0, size: 2 });
    });

    it('should wait until there is an idle resource if the pool is fully utilised', async () => {
      const factory = new TestFactory([{ resource: 1 }])
      const pool = new Pool({ factory, maxSize: 1 });

      const resource = await pool.acquire();

      await tmin(async () => {
        setTimeout(() => pool.release(resource), 100);
        await pool.acquire();
      }, 100)

      eq(pool.stats(), { queued:0, initialising: 0, idle:0, busy:1, destroying:0, segregated:0, size: 1 });
    });

    it('should retry on resource creation error', async () => {
      const factory = new TestFactory([{ createError: 'Oh Noes!' }, { resource: 2 }])
      const pool = new Pool({ factory });

      const resource = await pool.acquire();
      eq(resource, 2);

      eq(pool.stats(), { queued:0, initialising: 0, idle:0, busy:1, destroying:0, segregated:0, size: 1 });
    });

    it('should destroy resources created after the create timedout', async (t, done) => {
      const factory = new TestFactory([{ resource: 1, createDelay: 200 }, { resource: 2 }])
      const pool = new Pool({ factory, createTimeout: 100 });

      pool.on('resource_destroyed', () => {
        const definition = factory.findDefinition(1);
        ok(definition.destroyed);
        eq(pool.stats(), { queued:0, initialising: 0, idle:0, busy:1, destroying:0, segregated:0, size: 1 });
        done();
      });

      await pool.acquire();
    });

    it('should segregate resources that error when being destroyed', async (t, done) => {
      const factory = new TestFactory([{ resource: 1, createDelay: 200, destroyError: 'Oh Noes!' }, { resource: 2 }])
      const pool = new Pool({ factory, createTimeout: 100 });

      pool.on('resource_segregated', () => {
        const definition = factory.findDefinition(1);
        ok(definition.destroyed);
        eq(pool.stats(), { queued:0, initialising: 0, idle:0, busy:1, destroying:0, segregated:1, size: 2 });
        done();
      });

      await pool.acquire();
    });

    it('should segregate resources that timeout when being destroyed', async (t, done) => {
      const factory = new TestFactory([{ resource: 1, createDelay: 200, destroyDelay: 200 }, { resource: 2 }])
      const pool = new Pool({ factory, createTimeout: 100, destroyTimeout: 100 });

      pool.on('resource_segregated', () => {
        eq(pool.stats(), { queued:0, initialising: 0, idle:0, busy:1, destroying:0, segregated:1, size: 2 });
        done();
      });

      await pool.acquire();
    });

    it('should evict resources that are successfully destroyed after the destroy times out', async (t, done) => {
      const factory = new TestFactory([{ resource:1, createDelay: 200, destroyDelay: 200 }, { resource: 2 }])
      const pool = new Pool({ factory, createTimeout: 100, destroyTimeout: 100 });

      pool.on('resource_destroyed', () => {
        eq(pool.stats(), { queued:0, initialising: 0, idle:0, busy:1, destroying:0, segregated:0, size: 1 });
        done();
      });

      await pool.acquire();
    });

    it('should reject if the acquire times out', async () => {
      const factory = new TestFactory([{ resource: 1, createDelay: 200 }])
      const pool = new Pool({ factory, acquireTimeout: 100 });

      await rejects(() => pool.acquire(), (err) => {
        eq(err.message, 'Failed to acquire resource within 100ms');
        return true;
      });
    });

    it('should destroy any created resources if acquire times out', async (t, done) => {
      const factory = new TestFactory([{ resource: 1, createDelay: 200 }])
      const pool = new Pool({ factory, acquireTimeout: 100 });

      pool.on('resource_destroyed', () => {
        eq(pool.stats(), { queued:0, initialising: 0, idle:0, busy:0, destroying:0, segregated:0, size: 0 });
        done();
      })

      await rejects(() => pool.acquire(), (err) => {
        eq(err.message, 'Failed to acquire resource within 100ms');
        return true;
      });
    });

    it('should not remove dispatched requests from the queue if acquire times out');

    it('should remove request from the queue if acquire times out before the request is dispatched', async () => {
      const factory = new TestFactory([{ resource: 1 }])
      const pool = new Pool({ factory, maxSize: 1, acquireTimeout: 100 });

      // Block the queue by acquiring the only resource
      await pool.acquire();

      await rejects(() => pool.acquire(), (err) => {
        eq(err.message, 'Failed to acquire resource within 100ms');
        return true;
      });

      eq(pool.stats(), { queued:0, initialising: 0, idle:0, busy:1, destroying:0, segregated:0, size: 1 });
    });
  });

  describe('release', () => {

    it('should release resources returned to the pool', async () => {
      const factory = new TestFactory([{ resource: 1 }])
      const pool = new Pool({ factory });

      const resource = await pool.acquire();

      await pool.release(resource);

      eq(pool.stats(), { queued:0, initialising: 0, idle:1, busy:0, destroying:0, segregated:0, size: 1 });
    })

    it('should tolerate attempts to release an unmanaged resource', async () => {
      const factory = new TestFactory()
      const pool = new Pool({ factory });

      await pool.release(2);

      eq(pool.stats(), { queued:0, initialising: 0, idle:0, busy:0, destroying:0, segregated:0, size: 0 });
    })
  })

  describe('stats', () => {

    it('should provide empty statistics', () => {
      const pool = new Pool();
      const stats = pool.stats();
      eq(pool.stats(), { queued: 0, initialising: 0, idle:0, busy:0, destroying:0, segregated:0, size: 0 });
    });
  });
})
