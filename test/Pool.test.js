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
          eq(err.message, 'factory is a required option. Please read the documentation at https://github.com/acuminous/x-pool');
          return true;
        });
      });

      it('should require a factory with a create method', () => {
        const factory = { create: true, validate: () => {}, destroy: () => {} };
        throws(() => new Pool({ factory }), (err) => {
          eq(err.code, 'ERR_X-POOL_CONFIGURATION_ERROR');
          eq(err.message, 'The supplied factory is missing a create method. Please read the documentation at https://github.com/acuminous/x-pool');
          return true;
        });
      });

      it('should require a factory with a validate method', () => {
        const factory = { create: () => {}, validate: true, destroy: () => {} };
        throws(() => new Pool({ factory }), (err) => {
          eq(err.code, 'ERR_X-POOL_CONFIGURATION_ERROR');
          eq(err.message, 'The supplied factory is missing a validate method. Please read the documentation at https://github.com/acuminous/x-pool');
          return true;
        });
      });

      it('should require a factory with a destroy method', () => {
        const factory = { create: () => {}, validate: () => {}, destroy: true };
        throws(() => new Pool({ factory }), (err) => {
          eq(err.code, 'ERR_X-POOL_CONFIGURATION_ERROR');
          eq(err.message, 'The supplied factory is missing a destroy method. Please read the documentation at https://github.com/acuminous/x-pool');
          return true;
        });
      });
    });

    describe('acquireTimeout', () => {

      it('should require an acquireTimeout', () => {
        const factory = new TestFactory();
        throws(() => new Pool({ factory }), (err) => {
          eq(err.code, 'ERR_X-POOL_CONFIGURATION_ERROR');
          eq(err.message, 'acquireTimeout is a required option. Please read the documentation at https://github.com/acuminous/x-pool');
          return true;
        });
      });

      it('should require acquireTimeout to be a number', () => {
        const factory = new TestFactory();
        throws(() => new Pool({ factory, acquireTimeout: false }), (err) => {
          eq(err.code, 'ERR_X-POOL_CONFIGURATION_ERROR');
          eq(err.message, 'The acquireTimeout option must be a number. Please read the documentation at https://github.com/acuminous/x-pool');
          return true;
        });
      });

      it('should require acquireTimeout to be at least 1ms', () => {
        const factory = new TestFactory();
        throws(() => new Pool({ factory, acquireTimeout: 0 }), (err) => {
          eq(err.code, 'ERR_X-POOL_CONFIGURATION_ERROR');
          eq(err.message, 'The acquireTimeout option must be at least 1. Please read the documentation at https://github.com/acuminous/x-pool');
          return true;
        });
      });
    });

    describe('acquireRetryInterval', () => {

      it('should require acquireRetryInterval to be a number', () => {
        const factory = new TestFactory();
        throws(() => new Pool({ factory, acquireTimeout: 1000, acquireRetryInterval: false }), (err) => {
          eq(err.code, 'ERR_X-POOL_CONFIGURATION_ERROR');
          eq(err.message, 'The acquireRetryInterval option must be a number. Please read the documentation at https://github.com/acuminous/x-pool');
          return true;
        });
      });

      it('should require acquireRetryInterval to be at least 0ms', () => {
        const factory = new TestFactory();
        throws(() => new Pool({ factory, acquireTimeout: 1000, acquireRetryInterval: -1 }), (err) => {
          eq(err.code, 'ERR_X-POOL_CONFIGURATION_ERROR');
          eq(err.message, 'The acquireRetryInterval option must be at least 0. Please read the documentation at https://github.com/acuminous/x-pool');
          return true;
        });
      });
    });

    describe('destroyTimeout', () => {

      it('should require an destroyTimeout', () => {
        const factory = new TestFactory();
        throws(() => new Pool({ factory, acquireTimeout: 1000 }), (err) => {
          eq(err.code, 'ERR_X-POOL_CONFIGURATION_ERROR');
          eq(err.message, 'destroyTimeout is a required option. Please read the documentation at https://github.com/acuminous/x-pool');
          return true;
        });
      });

      it('should require destroyTimeout to be a number', () => {
        const factory = new TestFactory();
        throws(() => new Pool({ factory, acquireTimeout: 1000, destroyTimeout: false }), (err) => {
          eq(err.code, 'ERR_X-POOL_CONFIGURATION_ERROR');
          eq(err.message, 'The destroyTimeout option must be a number. Please read the documentation at https://github.com/acuminous/x-pool');
          return true;
        });
      });

      it('should require destroyTimeout to be at least 1ms', () => {
        const factory = new TestFactory();
        throws(() => new Pool({ factory, acquireTimeout: 1000, destroyTimeout: 0 }), (err) => {
          eq(err.code, 'ERR_X-POOL_CONFIGURATION_ERROR');
          eq(err.message, 'The destroyTimeout option must be at least 1. Please read the documentation at https://github.com/acuminous/x-pool');
          return true;
        });
      });
    });

    describe('maxSize', () => {

      it('should require maxSize to be a number', () => {
        const factory = new TestFactory();
        throws(() => new Pool({ factory, acquireTimeout: 1000, destroyTimeout: 1000, maxSize: false }), (err) => {
          eq(err.code, 'ERR_X-POOL_CONFIGURATION_ERROR');
          eq(err.message, 'The maxSize option must be a number. Please read the documentation at https://github.com/acuminous/x-pool');
          return true;
        });
      });

      it('should require maxSize to be at least 1', () => {
        const factory = new TestFactory();
        throws(() => new Pool({ factory, acquireTimeout: 1000, destroyTimeout: 1000, maxSize: 0 }), (err) => {
          eq(err.code, 'ERR_X-POOL_CONFIGURATION_ERROR');
          eq(err.message, 'The maxSize option must be at least 1. Please read the documentation at https://github.com/acuminous/x-pool');
          return true;
        });
      });
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
      ok(after - before >= 200, 'Did not wait between resource creation attempts');
    });

    it('should wait the specified time between resource creation attempts', async () => {
      const resources = [{ createError: 'Oh Noes!' }, { createError: 'Oh Noes!' }, 'R3'];
      const factory = new TestFactory(resources);
      const pool = createPool({ factory, acquireRetryInterval: 200 });

      const before = Date.now();
      const resource = await pool.acquire();
      const after = Date.now();

      eq(resource, 'R3');
      ok(after - before >= 400, 'Did not wait sufficiently between resource creation attempts');
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

      ok(after - before >= 100, 'Pool was not temporarily blocked');
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

      ok(after - before >= 100, 'Pool was not temporarily blocked');
      eq(resource2, 'R2');
    });
  });

  describe('release', () => {

    it('should release the given managed resource', async () => {
      const resources = ['R1'];
      const factory = new TestFactory(resources);
      const pool = createPool({ factory });

      const resource = await pool.acquire();
      pool.release(resource);

      const { size, acquired, idle } = pool.stats();
      eq(1, size);
      eq(0, acquired);
      eq(1, idle);
    });

    it('should tolerate releasing an unmanaged resource', () => {
      const factory = new TestFactory();
      const pool = createPool({ factory });

      pool.release('XX');

      const { size, idle } = pool.stats();
      eq(0, size);
      eq(0, idle);
    });
  });

  describe('destroy', () => {

    it('should eventually remove the given managed resource from the pool', async () => {
      const resources = ['R1'];
      const factory = new TestFactory(resources);
      const pool = createPool({ factory });

      const resource = await pool.acquire();
      pool.destroy(resource);

      setTimeout(() => {
        const { size, acquired, idle } = pool.stats();
        eq(0, size);
        eq(0, acquired);
        eq(0, idle);
      }, 100);
    });

    it('should destroy the given managed resource eventually', async (t, done) => {
      const resources = ['R1'];
      const factory = new TestFactory(resources);
      const pool = createPool({ factory });

      const resource = await pool.acquire();
      pool.destroy(resource);

      const timerId = setInterval(() => {
        if (!factory.wasDestroyed(resource)) return;
        clearInterval(timerId);
        done();
      }).unref();
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

  });

  describe('stats', () => {

    it('should report stats for an empty pool', () => {
      const factory = new TestFactory();
      const pool = createPool({ factory });

      const { size, acquired, idle, available } = pool.stats();
      eq(0, size);
      eq(0, acquired);
      eq(0, idle);
      eq(Infinity, available);
    });

    it('should report stats for a pool with acquired resources', async () => {
      const resources = ['R1', 'R2', 'R3'];
      const factory = new TestFactory(resources);
      const pool = createPool({ factory });

      await acquireResources(pool, 3);

      const { size, acquired, idle, available } = pool.stats();
      eq(3, size);
      eq(3, acquired);
      eq(0, idle);
      eq(Infinity, available);
    });

    it('should report stats for a pool with idle resources', async () => {
      const resources = ['R1', 'R2', 'R3'];
      const factory = new TestFactory(resources);
      const pool = createPool({ factory });

      const [resource1, resource2, resource3] = await acquireResources(pool, 3);
      releaseResources(pool, [resource1, resource2, resource3]);

      const { size, acquired, idle, available } = pool.stats();
      eq(3, size);
      eq(0, acquired);
      eq(3, idle);
      eq(Infinity, available);
    });

    it('should report stats for a pool with a mixture of idle and acquired resource', async () => {
      const resources = ['R1', 'R2', 'R3'];
      const factory = new TestFactory(resources);
      const pool = createPool({ factory });

      const [resource1, resource2] = await acquireResources(pool, 3);
      releaseResources(pool, [resource1, resource2]);

      const { size, acquired, idle, available } = pool.stats();
      eq(3, size);
      eq(1, acquired);
      eq(2, idle);
      eq(Infinity, available);
    });

    it('should report stats for a pool with a maximum size', async () => {
      const resources = ['R1', 'R2', 'R3'];
      const factory = new TestFactory(resources);
      const pool = createPool({ factory, maxSize: 10 });

      const [resource1, resource2] = await acquireResources(pool, 3);
      releaseResources(pool, [resource1, resource2]);

      const { size, acquired, idle, available } = pool.stats();
      eq(3, size);
      eq(1, acquired);
      eq(2, idle);
      eq(9, available);
    });
  });
});

function createPool({ factory, acquireTimeout = 1000, acquireRetryInterval, destroyTimeout = 1000, maxSize }) {
  return new Pool({ factory, acquireTimeout, acquireRetryInterval, destroyTimeout, maxSize });
}

function acquireResources(pool, count) {
  return Promise.all(new Array(count).fill().map(() => pool.acquire()));
}

function releaseResources(pool, resources) {
  resources.map((r) => pool.release(r));
}
