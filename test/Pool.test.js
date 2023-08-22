const { strictEqual: eq, ok, rejects, throws, fail } = require('node:assert');
const { scheduler } = require('node:timers/promises');
const { describe, it } = require('zunit');
const TestFactory = require('./lib/TestFactory');
const { Pool } = require('../index');

describe('Pool', () => {

  describe('Configuration Options', () => {

    describe('factory', () => {

      it('should require a factory', () => {
        throws(() => new Pool(), (err) => {
          eq(err.code, 'ERR_X-POOL_CONFIGURATION_ERROR');
          eq(err.message, 'factory is a required option. Please read the documentation at https://acuminous.github.io/x-pool');
          return true;
        });
      });

      it('should require a factory with a create method', () => {
        const factory = { create: true, validate: () => { }, destroy: () => { } };
        throws(() => new Pool({ factory }), (err) => {
          eq(err.code, 'ERR_X-POOL_CONFIGURATION_ERROR');
          eq(err.message, 'The supplied factory is missing a create method. Please read the documentation at https://acuminous.github.io/x-pool');
          return true;
        });
      });

      it('should require a factory with a validate method', () => {
        const factory = { create: () => { }, validate: true, destroy: () => { } };
        throws(() => new Pool({ factory }), (err) => {
          eq(err.code, 'ERR_X-POOL_CONFIGURATION_ERROR');
          eq(err.message, 'The supplied factory is missing a validate method. Please read the documentation at https://acuminous.github.io/x-pool');
          return true;
        });
      });

      it('should require a factory with a destroy method', () => {
        const factory = { create: () => { }, validate: () => { }, destroy: true };
        throws(() => new Pool({ factory }), (err) => {
          eq(err.code, 'ERR_X-POOL_CONFIGURATION_ERROR');
          eq(err.message, 'The supplied factory is missing a destroy method. Please read the documentation at https://acuminous.github.io/x-pool');
          return true;
        });
      });
    });

    describe('maxSize', () => {

      it('should require maxSize to be a number', () => {
        const factory = new TestFactory();
        throws(() => new Pool({ factory, acquireTimeout: 1000, destroyTimeout: 1000, maxSize: false }), (err) => {
          eq(err.code, 'ERR_X-POOL_CONFIGURATION_ERROR');
          eq(err.message, 'The maxSize option must be a number. Please read the documentation at https://acuminous.github.io/x-pool');
          return true;
        });
      });

      it('should require maxSize to be at least 1', () => {
        const factory = new TestFactory();
        throws(() => new Pool({ factory, acquireTimeout: 1000, destroyTimeout: 1000, maxSize: 0 }), (err) => {
          eq(err.code, 'ERR_X-POOL_CONFIGURATION_ERROR');
          eq(err.message, 'The maxSize option must be at least 1. Please read the documentation at https://acuminous.github.io/x-pool');
          return true;
        });
      });
    });

    describe('minSize', () => {

      it('should require minSize to be a number', () => {
        const factory = new TestFactory();
        throws(() => new Pool({ factory, acquireTimeout: 1000, destroyTimeout: 1000, minSize: false }), (err) => {
          eq(err.code, 'ERR_X-POOL_CONFIGURATION_ERROR');
          eq(err.message, 'The minSize option must be a number. Please read the documentation at https://acuminous.github.io/x-pool');
          return true;
        });
      });

      it('should require minSize to be at least 0', () => {
        const factory = new TestFactory();
        throws(() => new Pool({ factory, acquireTimeout: 1000, destroyTimeout: 1000, minSize: -1 }), (err) => {
          eq(err.code, 'ERR_X-POOL_CONFIGURATION_ERROR');
          eq(err.message, 'The minSize option must be at least 0. Please read the documentation at https://acuminous.github.io/x-pool');
          return true;
        });
      });

      it('should require minSize to be less than or equal to maxSize', () => {
        const factory = new TestFactory();
        throws(() => new Pool({ factory, acquireTimeout: 1000, destroyTimeout: 1000, minSize: 10, maxSize: 9 }), (err) => {
          eq(err.code, 'ERR_X-POOL_CONFIGURATION_ERROR');
          eq(err.message, 'The minSize option must be less than or equal to maxSize. Please read the documentation at https://acuminous.github.io/x-pool');
          return true;
        });
      });
    });

    describe('acquireTimeout', () => {

      it('should require an acquireTimeout', () => {
        const factory = new TestFactory();
        throws(() => new Pool({ factory }), (err) => {
          eq(err.code, 'ERR_X-POOL_CONFIGURATION_ERROR');
          eq(err.message, 'acquireTimeout is a required option. Please read the documentation at https://acuminous.github.io/x-pool');
          return true;
        });
      });

      it('should require acquireTimeout to be a number', () => {
        const factory = new TestFactory();
        throws(() => new Pool({ factory, acquireTimeout: false }), (err) => {
          eq(err.code, 'ERR_X-POOL_CONFIGURATION_ERROR');
          eq(err.message, 'The acquireTimeout option must be a number. Please read the documentation at https://acuminous.github.io/x-pool');
          return true;
        });
      });

      it('should require acquireTimeout to be at least 1ms', () => {
        const factory = new TestFactory();
        throws(() => new Pool({ factory, acquireTimeout: 0 }), (err) => {
          eq(err.code, 'ERR_X-POOL_CONFIGURATION_ERROR');
          eq(err.message, 'The acquireTimeout option must be at least 1. Please read the documentation at https://acuminous.github.io/x-pool');
          return true;
        });
      });
    });

    describe('acquireRetryInterval', () => {

      it('should require acquireRetryInterval to be a number', () => {
        const factory = new TestFactory();
        throws(() => new Pool({ factory, acquireTimeout: 1000, acquireRetryInterval: false }), (err) => {
          eq(err.code, 'ERR_X-POOL_CONFIGURATION_ERROR');
          eq(err.message, 'The acquireRetryInterval option must be a number. Please read the documentation at https://acuminous.github.io/x-pool');
          return true;
        });
      });

      it('should require acquireRetryInterval to be at least 0ms', () => {
        const factory = new TestFactory();
        throws(() => new Pool({ factory, acquireTimeout: 1000, acquireRetryInterval: -1 }), (err) => {
          eq(err.code, 'ERR_X-POOL_CONFIGURATION_ERROR');
          eq(err.message, 'The acquireRetryInterval option must be at least 0. Please read the documentation at https://acuminous.github.io/x-pool');
          return true;
        });
      });
    });

    describe('destroyTimeout', () => {

      it('should require a destroyTimeout', () => {
        const factory = new TestFactory();
        throws(() => new Pool({ factory, acquireTimeout: 1000 }), (err) => {
          eq(err.code, 'ERR_X-POOL_CONFIGURATION_ERROR');
          eq(err.message, 'destroyTimeout is a required option. Please read the documentation at https://acuminous.github.io/x-pool');
          return true;
        });
      });

      it('should require destroyTimeout to be a number', () => {
        const factory = new TestFactory();
        throws(() => new Pool({ factory, acquireTimeout: 1000, destroyTimeout: false }), (err) => {
          eq(err.code, 'ERR_X-POOL_CONFIGURATION_ERROR');
          eq(err.message, 'The destroyTimeout option must be a number. Please read the documentation at https://acuminous.github.io/x-pool');
          return true;
        });
      });

      it('should require destroyTimeout to be at least 1ms', () => {
        const factory = new TestFactory();
        throws(() => new Pool({ factory, acquireTimeout: 1000, destroyTimeout: 0 }), (err) => {
          eq(err.code, 'ERR_X-POOL_CONFIGURATION_ERROR');
          eq(err.message, 'The destroyTimeout option must be at least 1. Please read the documentation at https://acuminous.github.io/x-pool');
          return true;
        });
      });
    });

    describe('shutdownTimeout', () => {

      it('should require shutdownTimeout to be a number', () => {
        const factory = new TestFactory();
        throws(() => new Pool({ factory, acquireTimeout: 1000, destroyTimeout: 1000, shutdownTimeout: false }), (err) => {
          eq(err.code, 'ERR_X-POOL_CONFIGURATION_ERROR');
          eq(err.message, 'The shutdownTimeout option must be a number. Please read the documentation at https://acuminous.github.io/x-pool');
          return true;
        });
      });

      it('should require shutdownTimeout to be at least 1ms', () => {
        const factory = new TestFactory();
        throws(() => new Pool({ factory, acquireTimeout: 1000, destroyTimeout: 1000, shutdownTimeout: 0 }), (err) => {
          eq(err.code, 'ERR_X-POOL_CONFIGURATION_ERROR');
          eq(err.message, 'The shutdownTimeout option must be at least 1. Please read the documentation at https://acuminous.github.io/x-pool');
          return true;
        });
      });
    });
  });

  describe('API', () => {

    describe('initialise', () => {

      it('should block until the pool reaches the minimum size', async () => {
        const resources = ['R1', 'R2', 'R3', 'R4', 'R5'];
        const factory = new TestFactory(resources);
        const pool = createPool({ factory, minSize: 5 });

        await pool.initialise();

        const { size, idle } = pool.stats();
        eq(size, 5);
        eq(idle, 5);
      });

      it('should reject when the initialiseTimeout is exceeded', async () => {
        const resources = [];
        const factory = new TestFactory(resources);
        const pool = createPool({ factory, minSize: 5, initialiseTimeout: 200 });

        await rejects(() => pool.initialise(), (err) => {
          eq(err.code, 'ERR_X-POOL_OPERATION_TIMEDOUT');
          return true;
        });
      });

      it('should tolerate repeat intialisation calls', async () => {
        const resources = ['R1', 'R2', 'R3', 'R4', 'R5'];
        const factory = new TestFactory(resources);
        const pool = createPool({ factory, minSize: 2 });

        await pool.initialise();
        await pool.acquire();
        await pool.initialise();

        const { size, idle, acquired } = pool.stats();
        eq(size, 2);
        eq(idle, 1);
        eq(acquired, 1);
      });
    });

    describe('acquire', () => {

      it('should create a new resource when the pool is empty', async () => {
        const resources = ['R1'];
        const factory = new TestFactory(resources);
        const pool = createPool({ factory });

        const resource = await pool.acquire();

        eq(resource, 'R1');
      });

      it('should create a new resource when the pool contains no idle resources', async () => {
        const resources = ['R1', 'R2'];
        const factory = new TestFactory(resources);
        const pool = createPool({ factory });

        const resource1 = await pool.acquire();
        eq(resource1, 'R1');

        const resource2 = await pool.acquire();
        eq(resource2, 'R2');
      });

      it('should reuse an existing resource when the pool contains idle resources', async () => {
        const resources = ['R1'];
        const factory = new TestFactory(resources);
        const pool = createPool({ factory });

        const resource1 = await pool.acquire();
        eq(resource1, 'R1');
        pool.release(resource1);

        const resource2 = await pool.acquire();
        eq(resource2, 'R1');
      });

      it('should tolerate resource creation errors', async () => {
        const resources = [{ createError: 'Oh Noes!' }, 'R2'];
        const factory = new TestFactory(resources);
        const pool = createPool({ factory });

        const resource = await pool.acquire();
        eq(resource, 'R2');
      });

      it('should not attempt to validate after a creation error', async () => {
        const resources = [{ createError: 'Oh Noes!' }, 'R2'];
        const factory = new TestFactory(resources);
        const pool = createPool({ factory });

        pool.once('ERR_X-POOL_RESOURCE_VALIDATION_FAILED', () => {
          fail('Attempted to validate a resource after creation failure');
        });

        const resource = await pool.acquire();
        eq(resource, 'R2');
      });

      it('should wait briefly between failed resource creation attempts', async () => {
        const resources = [{ createError: 'Oh Noes!' }, { createError: 'Oh Noes!' }, 'R3'];
        const factory = new TestFactory(resources);
        const pool = createPool({ factory });

        const before = Date.now();
        const resource = await pool.acquire();
        const after = Date.now();

        eq(resource, 'R3');
        ok(after - before >= 199, `Only waited an average of ${(after - before) / 2}ms between resource creation attempts`);
      });

      it('should wait the specified time between resource creation attempts', async () => {
        const resources = [{ createError: 'Oh Noes!' }, { createError: 'Oh Noes!' }, 'R3'];
        const factory = new TestFactory(resources);
        const pool = createPool({ factory, acquireRetryInterval: 200 });

        const before = Date.now();
        const resource = await pool.acquire();
        const after = Date.now();

        eq(resource, 'R3');
        ok(after - before >= 399, 'Did not wait sufficiently between resource creation attempts');
      });

      it('should report resource creation errors via a specific event', async (t, done) => {
        const resources = [{ createError: 'Oh Noes!' }, 'R2'];
        const factory = new TestFactory(resources);
        const pool = createPool({ factory });

        pool.once('ERR_X-POOL_RESOURCE_CREATION_FAILED', (err) => {
          eq(err.code, 'ERR_X-POOL_RESOURCE_CREATION_FAILED');
          eq(err.cause.message, 'Oh Noes!');
          done();
        });

        await pool.acquire();
      });

      it('should fallback to reporting resource creation errors via a general event', async (t, done) => {
        const resources = [{ createError: 'Oh Noes!' }, 'R2'];
        const factory = new TestFactory(resources);
        const pool = createPool({ factory });

        pool.once('ERR_X-POOL_ERROR', (err) => {
          eq(err.code, 'ERR_X-POOL_RESOURCE_CREATION_FAILED');
          eq(err.cause.message, 'Oh Noes!');
          done();
        });

        await pool.acquire();
      });

      it('should reject when the acquire timeout is exceeded', async () => {
        const resources = [{ createDelay: 200, value: 'R1' }];
        const factory = new TestFactory(resources);
        const pool = createPool({ factory, acquireTimeout: 100 });

        await rejects(() => pool.acquire(), (err) => {
          eq(err.code, 'ERR_X-POOL_OPERATION_TIMEDOUT');
          return true;
        });
      });

      it('should use valid resources yielded after the acquire timeout is exceeded', async () => {
        const resources = [{ createDelay: 200, value: 'R1' }];
        const factory = new TestFactory(resources);
        const pool = createPool({ factory, acquireTimeout: 100 });

        await rejects(() => pool.acquire(), (err) => {
          eq(err.code, 'ERR_X-POOL_OPERATION_TIMEDOUT');
          return true;
        });

        await scheduler.wait(200);

        const resource = await pool.acquire();
        eq(resource, 'R1');
      });

      it('should tolerate resource validation failure', async () => {
        const resources = [{ validateError: 'Oh Noes!' }, 'R2'];
        const factory = new TestFactory(resources);
        const pool = createPool({ factory });

        const resource = await pool.acquire();
        eq(resource, 'R2');
      });

      it('should report resource validation errors via a specific event', async (t, done) => {
        const resources = [{ validateError: 'Oh Noes!' }, 'R2'];
        const factory = new TestFactory(resources);
        const pool = createPool({ factory });

        pool.once('ERR_X-POOL_RESOURCE_VALIDATION_FAILED', (err) => {
          eq(err.code, 'ERR_X-POOL_RESOURCE_VALIDATION_FAILED');
          eq(err.cause.message, 'Oh Noes!');
          done();
        });

        await pool.acquire();
      });

      it('should fallback to reporting resource validation errors via a general event', async (t, done) => {
        const resources = [{ validateError: 'Oh Noes!' }, 'R2'];
        const factory = new TestFactory(resources);
        const pool = createPool({ factory });

        pool.once('ERR_X-POOL_ERROR', (err) => {
          eq(err.code, 'ERR_X-POOL_RESOURCE_VALIDATION_FAILED');
          eq(err.cause.message, 'Oh Noes!');
          done();
        });

        await pool.acquire();
      });

      it('should destroy resources which failed validation', async (t, done) => {
        const resources = [{ validateError: 'Oh Noes!', value: 'R1' }, 'R2'];
        const factory = new TestFactory(resources);
        const pool = createPool({ factory });

        setTimeout(() => {
          ok(factory.wasDestroyed('R1'), 'Resource was not destroyed');
          done();
        }, 100);

        await pool.acquire();
      });

      it('should block requests once the maximum pool size has been reached', async () => {
        const resources = ['R1'];
        const factory = new TestFactory(resources);
        const pool = createPool({ factory, acquireTimeout: 200, maxSize: 1 });

        await pool.acquire();

        await rejects(() => pool.acquire(), (err) => {
          eq(err.code, 'ERR_X-POOL_OPERATION_TIMEDOUT');
          return true;
        });
      });

      it('should unblock requests once a resource is released', async () => {
        const resources = ['R1'];
        const factory = new TestFactory(resources);
        const pool = createPool({ factory, acquireTimeout: 200, maxSize: 1 });

        const resource1 = await pool.acquire();
        setTimeout(() => pool.release(resource1), 100);

        const before = Date.now();
        const resource2 = await pool.acquire();
        const after = Date.now();

        ok(after - before >= 99, 'Pool was not temporarily blocked');
        eq(resource2, 'R1');
      });

      it('should unblock requests once a resource is destroyed', async () => {
        const resources = ['R1', 'R2'];
        const factory = new TestFactory(resources);
        const pool = createPool({ factory, acquireTimeout: 200, maxSize: 1 });

        const resource1 = await pool.acquire();
        setTimeout(() => pool.destroy(resource1), 100);

        const before = Date.now();
        const resource2 = await pool.acquire();
        const after = Date.now();

        ok(after - before >= 99, 'Pool was not temporarily blocked');
        eq(resource2, 'R2');
      });
    });

    describe('release', () => {

      it('should release the supplied resource', async () => {
        const resources = ['R1'];
        const factory = new TestFactory(resources);
        const pool = createPool({ factory });

        const resource = await pool.acquire();
        pool.release(resource);

        const { size, acquired, idle } = pool.stats();
        eq(size, 1);
        eq(acquired, 0);
        eq(idle, 1);
      });

      it('should tolerate releasing an unmanaged resource', () => {
        const factory = new TestFactory();
        const pool = createPool({ factory });

        pool.release('XX');

        const { size, idle } = pool.stats();
        eq(size, 0);
        eq(idle, 0);
      });
    });

    describe('destroy', () => {

      it('should remove the supplied resource from the pool eventually', async () => {
        const resources = ['R1'];
        const factory = new TestFactory(resources);
        const pool = createPool({ factory });

        const resource = await pool.acquire();
        pool.destroy(resource);

        setTimeout(() => {
          const { size, acquired, idle } = pool.stats();
          eq(size, 0);
          eq(acquired, 0);
          eq(idle, 0);
        }, 100);
      });

      it('should destroy the supplied resource eventually', async (t, done) => {
        const resources = ['R1'];
        const factory = new TestFactory(resources);
        const pool = createPool({ factory });

        const resource = await pool.acquire();
        pool.destroy(resource);

        const timerId = setInterval(() => {
          if (!factory.wasDestroyed(resource)) return;
          clearInterval(timerId);
          done();
        });
      });

      it('should report resource destruction errors via a specific event', async (t, done) => {
        const resources = [{ destroyError: 'Oh Noes!', value: 'R1' }];
        const factory = new TestFactory(resources);
        const pool = createPool({ factory });

        pool.once('ERR_X-POOL_RESOURCE_DESTRUCTION_FAILED', (err) => {
          eq(err.code, 'ERR_X-POOL_RESOURCE_DESTRUCTION_FAILED');
          eq(err.cause.message, 'Oh Noes!');
          done();
        });

        const resource = await pool.acquire();
        pool.destroy(resource);
      });

      it('should fallback to reporting resource destruction errors via a general event', async (t, done) => {
        const resources = [{ destroyError: 'Oh Noes!', value: 'R1' }];
        const factory = new TestFactory(resources);
        const pool = createPool({ factory });

        pool.once('ERR_X-POOL_ERROR', (err) => {
          eq(err.code, 'ERR_X-POOL_RESOURCE_DESTRUCTION_FAILED');
          eq(err.cause.message, 'Oh Noes!');
          done();
        });

        const resource = await pool.acquire();
        pool.destroy(resource);
      });

      it('should report resource destruction that exceed the destroyTimeout', async (t, done) => {
        const resources = [{ destroyDelay: 200, value: 'R1' }];
        const factory = new TestFactory(resources);
        const pool = createPool({ factory, destroyTimeout: 100 });

        pool.once('ERR_X-POOL_OPERATION_TIMEDOUT', (err) => {
          eq(err.code, 'ERR_X-POOL_OPERATION_TIMEDOUT');
          eq(err.message, 'destroy timedout after 100ms');
          done();
        });

        const resource = await pool.acquire();
        pool.destroy(resource);
      });

      it('should fallback to reporting resource destruction errors via a general event', async (t, done) => {
        const resources = [{ destroyError: 'Oh Noes!', value: 'R1' }];
        const factory = new TestFactory(resources);
        const pool = createPool({ factory });

        pool.once('ERR_X-POOL_ERROR', (err) => {
          eq(err.code, 'ERR_X-POOL_RESOURCE_DESTRUCTION_FAILED');
          eq(err.cause.message, 'Oh Noes!');
          done();
        });

        const resource = await pool.acquire();
        pool.destroy(resource);
      });

      it('should quaranteen resources that failed to be destroyed due to error', async (t, done) => {
        const resources = [{ destroyError: 'Oh Noes!', value: 'R1' }];
        const factory = new TestFactory(resources);
        const pool = createPool({ factory });

        pool.once('ERR_X-POOL_RESOURCE_DESTRUCTION_FAILED', () => {
          const { size, acquired, bad } = pool.stats();
          eq(size, 1);
          eq(acquired, 0);
          eq(bad, 1);
          done();
        });

        const resource = await pool.acquire();
        pool.destroy(resource);
      });

      it('should quaranteen resources that failed to be destroyed due to timeout', async (t, done) => {
        const resources = [{ destroyDelay: 200, value: 'R1' }];
        const factory = new TestFactory(resources);
        const pool = createPool({ factory, destroyTimeout: 100 });

        pool.once('ERR_X-POOL_OPERATION_TIMEDOUT', () => {
          const { size, acquired, bad } = pool.stats();
          eq(size, 1);
          eq(acquired, 0);
          eq(bad, 1);
          done();
        });

        const resource = await pool.acquire();
        pool.destroy(resource);
      });

      it('should discard quaranteened resources that were destroyed after the timeout expired', async (t, done) => {
        const resources = [{ destroyDelay: 200, value: 'R1' }];
        const factory = new TestFactory(resources);
        const pool = createPool({ factory, destroyTimeout: 100 });

        const resource = await pool.acquire();
        pool.destroy(resource);

        setTimeout(() => {
          const { size, acquired, bad } = pool.stats();
          eq(size, 0);
          eq(acquired, 0);
          eq(bad, 0);
          done();
        }, 300);
      });
    });

    describe('evictBadResources', () => {

      it('should evict bad resources', async (t, done) => {
        const resources = [{ destroyDelay: 200, value: 'R1' }, { destroyError: 'Oh Noes!', value: 'R2' }];
        const factory = new TestFactory(resources);
        const pool = createPool({ factory, destroyTimeout: 100 });

        pool.once('ERR_X-POOL_OPERATION_TIMEDOUT', () => {

          const stats1 = pool.stats();
          eq(stats1.bad, 2);

          pool.evictBadResources();

          const stats2 = pool.stats();
          eq(stats2.bad, 0);
          done();
        });

        const [resource1, resource2] = await acquireResources(pool, 2);
        pool.destroy(resource1);
        pool.destroy(resource2);
      });

    });

    describe('stats', () => {

      it('should report stats for an empty pool', () => {
        const factory = new TestFactory();
        const pool = createPool({ factory });

        const { queued, acquiring, acquired, idle, bad, size, available } = pool.stats();
        eq(queued, 0);
        eq(acquiring, 0);
        eq(acquired, 0);
        eq(idle, 0);
        eq(bad, 0);
        eq(size, 0);
        eq(available, Infinity);
      });

      it('should report stats for a pool with acquired resources', async () => {
        const resources = ['R1', 'R2', 'R3'];
        const factory = new TestFactory(resources);
        const pool = createPool({ factory });

        await acquireResources(pool, 3);

        const { queued, acquiring, acquired, idle, bad, size, available } = pool.stats();
        eq(queued, 0);
        eq(acquiring, 0);
        eq(acquired, 3);
        eq(idle, 0);
        eq(bad, 0);
        eq(size, 3);
        eq(available, Infinity);
      });

      it('should report stats for a pool with idle resources', async () => {
        const resources = ['R1', 'R2', 'R3'];
        const factory = new TestFactory(resources);
        const pool = createPool({ factory });

        const [resource1, resource2, resource3] = await acquireResources(pool, 3);
        releaseResources(pool, [resource1, resource2, resource3]);

        const { queued, acquiring, acquired, idle, bad, size, available } = pool.stats();
        eq(queued, 0);
        eq(acquiring, 0);
        eq(acquired, 0);
        eq(idle, 3);
        eq(bad, 0);
        eq(size, 3);
        eq(available, Infinity);
      });

      it('should report stats for a pool with queued acquisition requests', async () => {
        const resources = ['R1'];
        const factory = new TestFactory(resources);
        const pool = createPool({ factory, maxSize: 1 });

        await pool.acquire();
        pool.acquire();
        pool.acquire();

        const { queued, acquiring, acquired, idle, bad, size, available } = pool.stats();
        eq(queued, 2);
        eq(acquiring, 0);
        eq(acquired, 1);
        eq(idle, 0);
        eq(bad, 0);
        eq(size, 1);
        eq(available, 0);
      });

      it('should report stats for a pool with bad resources', async (t, done) => {
        const resources = ['R1', { destroyError: 'Oh Noes!', value: 'R2' }, 'R3'];
        const factory = new TestFactory(resources);
        const pool = createPool({ factory });

        pool.once('ERR_X-POOL_RESOURCE_DESTRUCTION_FAILED', () => {
          const { queued, acquiring, acquired, idle, bad, size, available } = pool.stats();
          eq(queued, 0);
          eq(acquiring, 0);
          eq(acquired, 0);
          eq(idle, 0);
          eq(bad, 1);
          eq(size, 1);
          eq(available, Infinity);
          done();
        });

        const [resource1, resource2, resource3] = await acquireResources(pool, 3);
        destroyResources(pool, [resource1, resource2, resource3]);
      });

      it('should report stats for a pool with a mixture of resource states', async (t, done) => {
        const resources = ['R1', 'R2', { destroyError: 'Oh Noes!', value: 'R3' }];
        const factory = new TestFactory(resources);
        const pool = createPool({ factory });

        pool.once('ERR_X-POOL_RESOURCE_DESTRUCTION_FAILED', () => {
          const { queued, acquiring, acquired, idle, bad, size, available } = pool.stats();
          eq(queued, 0);
          eq(acquiring, 0);
          eq(acquired, 1);
          eq(idle, 1);
          eq(bad, 1);
          eq(size, 3);
          eq(available, Infinity);
          done();
        });

        const [, resource2, resource3] = await acquireResources(pool, 3);
        pool.release(resource2);
        pool.destroy(resource3);
      });

      it('should report stats for a pool with a mixture of resource states and a maximum pool size', async (t, done) => {
        const resources = ['R1', 'R2', { destroyError: 'Oh Noes!', value: 'R3' }];
        const factory = new TestFactory(resources);
        const pool = createPool({ factory, maxSize: 10 });

        pool.once('ERR_X-POOL_RESOURCE_DESTRUCTION_FAILED', () => {
          const { queued, acquiring, acquired, idle, bad, size, available } = pool.stats();
          eq(queued, 0);
          eq(acquiring, 0);
          eq(acquired, 1);
          eq(idle, 1);
          eq(bad, 1);
          eq(size, 3);
          eq(available, 8);
          done();
        });

        const [, resource2, resource3] = await acquireResources(pool, 3);
        pool.release(resource2);
        pool.destroy(resource3);
      });
    });

    describe('shutdown', () => {

      it('should reject repeat shutdown requests', async () => {
        const factory = new TestFactory();
        const pool = createPool({ factory });

        await pool.shutdown();

        await rejects(() => pool.shutdown(), (err) => {
          eq(err.code, 'ERR_X-POOL_OPERATION_FAILED');
          eq(err.message, 'The pool has been shutdown');
          return true;
        });
      });

      it('should reject new acquisition requests', async () => {
        const factory = new TestFactory();
        const pool = createPool({ factory });

        await pool.shutdown();

        await rejects(() => pool.acquire(), (err) => {
          eq(err.code, 'ERR_X-POOL_OPERATION_FAILED');
          eq(err.message, 'The pool has been shutdown');
          return true;
        });
      });

      it('should reject initialisation requests', async () => {
        const factory = new TestFactory();
        const pool = createPool({ factory });

        await pool.shutdown();

        await rejects(() => pool.initialise(), (err) => {
          eq(err.code, 'ERR_X-POOL_OPERATION_FAILED');
          eq(err.message, 'The pool has been shutdown');
          return true;
        });
      });

      it('should evict bad resources', async (t, done) => {
        const resources = [{ destroyError: 'Oh Noes!', value: 'R1' }];
        const factory = new TestFactory(resources);
        const pool = createPool({ factory, minSize: 1 });

        const resource = await pool.acquire();

        pool.once('ERR_X-POOL_RESOURCE_DESTRUCTION_FAILED', async () => {
          const { size: size1, bad: bad1 } = pool.stats();
          eq(size1, 1);
          eq(bad1, 1);

          await pool.shutdown();

          const { size: size2, bad: bad2 } = pool.stats();
          eq(size2, 0);
          eq(bad2, 0);

          done();
        });

        pool.destroy(resource);
      });

      it('should wait for idle resources to be destroyed', async () => {
        const resources = ['R1', 'R2', 'R3', 'R4', 'R5'];
        const factory = new TestFactory(resources);
        const pool = createPool({ factory, minSize: 5 });

        await pool.initialise();

        const { size: size1, idle: idle1 } = pool.stats();
        eq(size1, 5);
        eq(idle1, 5);

        await pool.shutdown();

        const { size: size2, idle: idle2 } = pool.stats();
        eq(size2, 0);
        eq(idle2, 0);
      });

      it('should wait for acquired resources to be released and destroyed', async () => {
        const resources = ['R1'];
        const factory = new TestFactory(resources);
        const pool = createPool({ factory });

        const resource = await pool.acquire();

        const { size: size1, acquired: acquired1 } = pool.stats();
        eq(size1, 1);
        eq(acquired1, 1);

        setTimeout(() => pool.release(resource), 100);

        await pool.shutdown();

        const { size: size2, acquired: acquired2 } = pool.stats();
        eq(size2, 0);
        eq(acquired2, 0);
      });

      it('should wait for queued acquisitions to be honoured', async (t, done) => {
        const resources = ['R1'];
        const factory = new TestFactory(resources);
        const pool = createPool({ factory, maxSize: 1 });

        // Acquire the only resource
        const resource1 = await pool.acquire();

        // Release the resource 200ms after it was acquired
        setTimeout(() => pool.release(resource1), 400);

        // Call shutdown while the resource is still on loan,
        // but after the second acquire
        setTimeout(async () => {
          const before = Date.now();
          await pool.shutdown();
          const after = Date.now();
          ok(after - before >= 399 - 200 + 200, 'Shutdown did not wait for pending acquitions');
          done();
        }, 200);

        // Create a pending acquisition
        const resource2 = await pool.acquire();

        // Release the resource in 200ms after it was acquired
        setTimeout(() => pool.release(resource2), 200);
      });

      it('should reject when the shutdownTimeout is exceeded', async () => {
        const resources = ['R1'];
        const factory = new TestFactory(resources);
        const pool = createPool({ factory, destroyTimeout: 200 });

        await pool.acquire();

        await rejects(() => pool.shutdown(), (err) => {
          eq(err.code, 'ERR_X-POOL_OPERATION_TIMEDOUT');
          return true;
        });
      });

      it('should tolerate resource destruction errors', async () => {
        const resources = [{ destroyError: 'Oh Noes!', value: 'R1' }];
        const factory = new TestFactory(resources);
        const pool = createPool({ factory, minSize: 1, destroyTimeout: 1000 });

        await pool.initialise();

        await pool.shutdown();
      });

      it('should report resource destruction errors via a specific event', async (t, done) => {
        const resources = [{ destroyError: 'Oh Noes!', value: 'R1' }];
        const factory = new TestFactory(resources);
        const pool = createPool({ factory, minSize: 1 });

        await pool.initialise();

        pool.once('ERR_X-POOL_RESOURCE_DESTRUCTION_FAILED', (err) => {
          eq(err.code, 'ERR_X-POOL_RESOURCE_DESTRUCTION_FAILED');
          eq(err.cause.message, 'Oh Noes!');
          done();
        });

        await pool.shutdown();
      });

      it('should fallback to reporting resource destruction errors via a general event', async (t, done) => {
        const resources = [{ destroyError: 'Oh Noes!', value: 'R1' }];
        const factory = new TestFactory(resources);
        const pool = createPool({ factory, minSize: 1 });

        await pool.initialise();

        pool.once('ERR_X-POOL_ERROR', (err) => {
          eq(err.code, 'ERR_X-POOL_RESOURCE_DESTRUCTION_FAILED');
          eq(err.cause.message, 'Oh Noes!');
          done();
        });

        await pool.shutdown();
      });
    });
  });

  describe('Resource Management', () => {

    describe('Eviction', () => {

      it('should evict idle resources once their evictionThreshold has been exceeded', () => {
      });

      it('should not evict idle resources when the pool size is at minimum', () => {
      });

      it('should quaranteen evicted resources that failed to be destroyed due to error', () => {
      });

      it('should quaranteen evicted resources that failed to be destroyed before the destroyTimeout was exceeded', () => {
      });

      it('should discard bad resources that are destroyed after the timeout expired', () => {
      });
    });
  });
});

function createPool({ factory, minSize, maxSize, initialiseTimeout, acquireTimeout = 1000, acquireRetryInterval, destroyTimeout = 1000 }) {
  return new Pool({ factory, minSize, maxSize, initialiseTimeout, acquireTimeout, acquireRetryInterval, destroyTimeout });
}

function acquireResources(pool, count) {
  return Promise.all(new Array(count).fill().map(() => pool.acquire()));
}

function releaseResources(pool, resources) {
  resources.map((r) => pool.release(r));
}

function destroyResources(pool, resources) {
  resources.map((r) => pool.destroy(r));
}
