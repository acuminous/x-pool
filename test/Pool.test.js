const { strictEqual: eq, ok, match, rejects, throws, fail } = require('node:assert', /blah/);
const { scheduler } = require('node:timers/promises');
const debug = require('debug')('x-pool');
const { describe, it, afterEach } = require('zunit');
const TestFactory = require('./lib/TestFactory');
const {
  Pool,
  Operations: { XPoolEvent, InitialisePoolOperation, CreateResourceOperation, ValidateResourceOperation, ReleaseResourceOperation, DestroyResourceOperation },
  Errors: { XPoolError, ConfigurationError, ResourceCreationFailed, ResourceValidationFailed, ResourceDestructionFailed, OperationTimedout, PoolNotRunning, MaxQueueDepthExceeded },
} = require('../index');

describe('Pool', () => {

  let pool;

  afterEach(async () => {
    if (!pool) return;
    await pool.kill();
    pool = null;
  });

  describe('Configuration Options', () => {

    describe('factory', () => {

      it('should require a factory', () => {
        throws(() => new Pool(), (err) => {
          eq(err.code, ConfigurationError.code);
          eq(err.message, 'factory is a required option. Please read the documentation at https://acuminous.github.io/x-pool');
          return true;
        });
      });

      it('should require a factory with a create method', () => {
        const factory = { create: true, validate: () => { }, destroy: () => { } };
        throws(() => new Pool({ factory }), (err) => {
          eq(err.code, ConfigurationError.code);
          eq(err.message, 'The supplied factory is missing a create method. Please read the documentation at https://acuminous.github.io/x-pool');
          return true;
        });
      });

      it('should require a factory with a validate method', () => {
        const factory = { create: () => { }, validate: true, destroy: () => { } };
        throws(() => new Pool({ factory }), (err) => {
          eq(err.code, ConfigurationError.code);
          eq(err.message, 'The supplied factory is missing a validate method. Please read the documentation at https://acuminous.github.io/x-pool');
          return true;
        });
      });

      it('should require a factory with a destroy method', () => {
        const factory = { create: () => { }, validate: () => { }, destroy: true };
        throws(() => new Pool({ factory }), (err) => {
          eq(err.code, ConfigurationError.code);
          eq(err.message, 'The supplied factory is missing a destroy method. Please read the documentation at https://acuminous.github.io/x-pool');
          return true;
        });
      });
    });

    describe('autoStart', () => {

      it('should require autoStart to be a boolean', () => {
        const factory = new TestFactory();
        throws(() => new Pool({ factory, acquireTimeout: 1000, destroyTimeout: 1000, autoStart: 'false' }), (err) => {
          eq(err.code, ConfigurationError.code);
          eq(err.message, 'The autoStart option must be a boolean. Please read the documentation at https://acuminous.github.io/x-pool');
          return true;
        });
      });

      it('should initialise the pool', async (t, done) => {
        const resources = ['R1', 'R2', 'R3', 'R4', 'R5'];
        const factory = new TestFactory(resources);
        pool = createPool({ factory, minSize: 5, autoStart: true });

        pool.once(InitialisePoolOperation.SUCCEEDED, () => {
          const { size, idle } = pool.stats();
          eq(size, 5);
          eq(idle, 5);
          done();
        });
      });
    });

    describe('maxSize', () => {

      it('should require maxSize to be a number', () => {
        const factory = new TestFactory();
        throws(() => new Pool({ factory, acquireTimeout: 1000, destroyTimeout: 1000, maxSize: false }), (err) => {
          eq(err.code, ConfigurationError.code);
          eq(err.message, 'The maxSize option must be a number. Please read the documentation at https://acuminous.github.io/x-pool');
          return true;
        });
      });

      it('should require maxSize to be at least 1', () => {
        const factory = new TestFactory();
        throws(() => new Pool({ factory, acquireTimeout: 1000, destroyTimeout: 1000, maxSize: 0 }), (err) => {
          eq(err.code, ConfigurationError.code);
          eq(err.message, 'The maxSize option must be at least 1. Please read the documentation at https://acuminous.github.io/x-pool');
          return true;
        });
      });
    });

    describe('minSize', () => {

      it('should require minSize to be a number', () => {
        const factory = new TestFactory();
        throws(() => new Pool({ factory, acquireTimeout: 1000, destroyTimeout: 1000, minSize: false }), (err) => {
          eq(err.code, ConfigurationError.code);
          eq(err.message, 'The minSize option must be a number. Please read the documentation at https://acuminous.github.io/x-pool');
          return true;
        });
      });

      it('should require minSize to be at least 0', () => {
        const factory = new TestFactory();
        throws(() => new Pool({ factory, acquireTimeout: 1000, destroyTimeout: 1000, minSize: -1 }), (err) => {
          eq(err.code, ConfigurationError.code);
          eq(err.message, 'The minSize option must be at least 0. Please read the documentation at https://acuminous.github.io/x-pool');
          return true;
        });
      });

      it('should require minSize to be less than or equal to maxSize', () => {
        const factory = new TestFactory();
        throws(() => new Pool({ factory, acquireTimeout: 1000, destroyTimeout: 1000, minSize: 10, maxSize: 9 }), (err) => {
          eq(err.code, ConfigurationError.code);
          eq(err.message, 'The minSize option must be less than or equal to maxSize. Please read the documentation at https://acuminous.github.io/x-pool');
          return true;
        });
      });
    });

    describe('maxQueueDepth', () => {

      it('should require maxQueueDepth to be a number', () => {
        const factory = new TestFactory();
        throws(() => new Pool({ factory, acquireTimeout: 1000, destroyTimeout: 1000, maxQueueDepth: false }), (err) => {
          eq(err.code, ConfigurationError.code);
          eq(err.message, 'The maxQueueDepth option must be a number. Please read the documentation at https://acuminous.github.io/x-pool');
          return true;
        });
      });

      it('should require maxQueueDepth to be at least 1', () => {
        const factory = new TestFactory();
        throws(() => new Pool({ factory, acquireTimeout: 1000, destroyTimeout: 1000, maxQueueDepth: 0 }), (err) => {
          eq(err.code, ConfigurationError.code);
          eq(err.message, 'The maxQueueDepth option must be at least 1. Please read the documentation at https://acuminous.github.io/x-pool');
          return true;
        });
      });
    });

    describe('acquireTimeout', () => {

      it('should require an acquireTimeout', () => {
        const factory = new TestFactory();
        throws(() => new Pool({ factory }), (err) => {
          eq(err.code, ConfigurationError.code);
          eq(err.message, 'acquireTimeout is a required option. Please read the documentation at https://acuminous.github.io/x-pool');
          return true;
        });
      });

      it('should require acquireTimeout to be a number', () => {
        const factory = new TestFactory();
        throws(() => new Pool({ factory, acquireTimeout: false }), (err) => {
          eq(err.code, ConfigurationError.code);
          eq(err.message, 'The acquireTimeout option must be a number. Please read the documentation at https://acuminous.github.io/x-pool');
          return true;
        });
      });

      it('should require acquireTimeout to be at least 1ms', () => {
        const factory = new TestFactory();
        throws(() => new Pool({ factory, acquireTimeout: 0 }), (err) => {
          eq(err.code, ConfigurationError.code);
          eq(err.message, 'The acquireTimeout option must be at least 1. Please read the documentation at https://acuminous.github.io/x-pool');
          return true;
        });
      });
    });

    describe('acquireRetryInterval', () => {
      it('should require acquireRetryInterval to be a number', () => {
        const factory = new TestFactory();
        throws(() => new Pool({ factory, acquireTimeout: 1000, acquireRetryInterval: false }), (err) => {
          eq(err.code, ConfigurationError.code);
          eq(err.message, 'The acquireRetryInterval option must be a number. Please read the documentation at https://acuminous.github.io/x-pool');
          return true;
        });
      });

      it('should require acquireRetryInterval to be at least 0ms', () => {
        const factory = new TestFactory();
        throws(() => new Pool({ factory, acquireTimeout: 1000, acquireRetryInterval: -1 }), (err) => {
          eq(err.code, ConfigurationError.code);
          eq(err.message, 'The acquireRetryInterval option must be at least 0. Please read the documentation at https://acuminous.github.io/x-pool');
          return true;
        });
      });
    });

    describe('destroyTimeout', () => {

      it('should require a destroyTimeout', () => {
        const factory = new TestFactory();
        throws(() => new Pool({ factory, acquireTimeout: 1000 }), (err) => {
          eq(err.code, ConfigurationError.code);
          eq(err.message, 'destroyTimeout is a required option. Please read the documentation at https://acuminous.github.io/x-pool');
          return true;
        });
      });

      it('should require destroyTimeout to be a number', () => {
        const factory = new TestFactory();
        throws(() => new Pool({ factory, acquireTimeout: 1000, destroyTimeout: false }), (err) => {
          eq(err.code, ConfigurationError.code);
          eq(err.message, 'The destroyTimeout option must be a number. Please read the documentation at https://acuminous.github.io/x-pool');
          return true;
        });
      });

      it('should require destroyTimeout to be at least 1ms', () => {
        const factory = new TestFactory();
        throws(() => new Pool({ factory, acquireTimeout: 1000, destroyTimeout: 0 }), (err) => {
          eq(err.code, ConfigurationError.code);
          eq(err.message, 'The destroyTimeout option must be at least 1. Please read the documentation at https://acuminous.github.io/x-pool');
          return true;
        });
      });
    });

    describe('shutdownTimeout', () => {

      it('should require shutdownTimeout to be a number', () => {
        const factory = new TestFactory();
        throws(() => new Pool({ factory, acquireTimeout: 1000, destroyTimeout: 1000, shutdownTimeout: false }), (err) => {
          eq(err.code, ConfigurationError.code);
          eq(err.message, 'The shutdownTimeout option must be a number. Please read the documentation at https://acuminous.github.io/x-pool');
          return true;
        });
      });

      it('should require shutdownTimeout to be at least 1ms', () => {
        const factory = new TestFactory();
        throws(() => new Pool({ factory, acquireTimeout: 1000, destroyTimeout: 1000, shutdownTimeout: 0 }), (err) => {
          eq(err.code, ConfigurationError.code);
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
        pool = createPool({ factory, minSize: 5 });

        await pool.initialise();

        const { size, idle } = pool.stats();
        eq(size, 5);
        eq(idle, 5);
      });

      it('should reject when the initialiseTimeout is exceeded', async () => {
        const resources = [];
        const factory = new TestFactory(resources);
        pool = createPool({ factory, minSize: 5, initialiseTimeout: 100 });

        await rejects(() => pool.initialise(), (err) => {
          eq(err.code, OperationTimedout.code);
          return true;
        });
      });

      it('should tolerate repeat intialisation calls', async () => {
        const resources = ['R1', 'R2', 'R3', 'R4', 'R5'];
        const factory = new TestFactory(resources);
        pool = createPool({ factory, minSize: 2 });

        await pool.initialise();
        await pool.acquire();
        await pool.initialise();

        const { size, idle, acquired } = pool.stats();
        eq(size, 2);
        eq(idle, 1);
        eq(acquired, 1);
      });

      it('should not exceed max queue depth when initialising', async () => {
        const resources = new Array(100).fill().map((_, index) => ({ createDelay: 100, value: `R${index + 1}` }));
        const factory = new TestFactory(resources);
        pool = createPool({ factory, minSize: 100, maxSize: 100, maxQueueDepth: 3, acquireTimeout: 1000 });

        await pool.initialise();
      });
    });

    describe('acquire', () => {

      it('should create a new resource when the pool is empty', async () => {
        const resources = ['R1'];
        const factory = new TestFactory(resources);
        pool = createPool({ factory });

        const resource = await pool.acquire();

        eq(resource, 'R1');
      });

      it('should create a new resource when the pool contains no idle resources', async () => {
        const resources = ['R1', 'R2'];
        const factory = new TestFactory(resources);
        pool = createPool({ factory });

        const resource1 = await pool.acquire();
        eq(resource1, 'R1');

        const resource2 = await pool.acquire();
        eq(resource2, 'R2');
      });

      it('should reuse an existing resource when the pool contains idle resources', async () => {
        const resources = ['R1'];
        const factory = new TestFactory(resources);
        pool = createPool({ factory });

        const resource1 = await pool.acquire();
        eq(resource1, 'R1');
        pool.release(resource1);

        const resource2 = await pool.acquire();
        eq(resource2, 'R1');
      });

      it('should tolerate resource creation errors', async () => {
        const resources = [{ createError: 'Oh Noes!' }, 'R2'];
        const factory = new TestFactory(resources);
        pool = createPool({ factory });

        const resource = await pool.acquire();
        eq(resource, 'R2');
      });

      it('should not attempt to validate after a creation error', async () => {
        const resources = [{ createError: 'Oh Noes!' }, 'R2'];
        const factory = new TestFactory(resources);
        pool = createPool({ factory });

        pool.once(ValidateResourceOperation.FAILED, () => {
          fail('Attempted to validate a resource after creation failure');
        });

        const resource = await pool.acquire();
        eq(resource, 'R2');
      });

      it('should wait briefly between failed resource creation attempts', async () => {
        const resources = [{ createError: 'Oh Noes!' }, { createError: 'Oh Noes!' }, 'R3'];
        const factory = new TestFactory(resources);
        pool = createPool({ factory });

        const before = Date.now();
        const resource = await pool.acquire();
        const after = Date.now();

        eq(resource, 'R3');
        ok(after - before >= 199, `Only waited an average of ${(after - before) / 2}ms between resource creation attempts`);
      });

      it('should wait the specified time between resource creation attempts', async () => {
        const resources = [{ createError: 'Oh Noes!' }, { createError: 'Oh Noes!' }, 'R3'];
        const factory = new TestFactory(resources);
        pool = createPool({ factory, acquireRetryInterval: 200 });

        const before = Date.now();
        const resource = await pool.acquire();
        const after = Date.now();

        eq(resource, 'R3');
        ok(after - before >= 399, `Only waited an average of ${(after - before) / 2}ms between resource creation attempts`);
      });

      it('should report resource creation errors via a specific event', async (t, done) => {
        const createError = new Error('Oh Noes!');
        const resources = [{ createError }, 'R2'];
        const factory = new TestFactory(resources);
        pool = createPool({ factory });

        pool.once(CreateResourceOperation.FAILED, ({ code, message, err }) => {
          eq(code, CreateResourceOperation.FAILED);
          match(message, /^\[\d+\] Error creating resource: Oh Noes!$/);
          eq(err.code, ResourceCreationFailed.code);
          match(err.message, /^Error creating resource: Oh Noes!$/);
          eq(err.cause, createError);
          done();
        });

        await pool.acquire();
      });

      it('should report resource creation errors via a general error event', async (t, done) => {
        const createError = new Error('Oh Noes!');
        const resources = [{ createError }, 'R2'];
        const factory = new TestFactory(resources);
        pool = createPool({ factory });

        pool.once(XPoolError, ({ code, message, err }) => {
          eq(code, CreateResourceOperation.FAILED);
          match(message, /^\[\d+\] Error creating resource: Oh Noes!$/);
          eq(err.code, ResourceCreationFailed.code);
          match(err.message, /^Error creating resource: Oh Noes!$/);
          eq(err.cause, createError);
          done();
        });

        await pool.acquire();
      });

      it('should report resource creation errors via a general event', async (t, done) => {
        const createError = new Error('Oh Noes!');
        const resources = [{ createError }, 'R2'];
        const factory = new TestFactory(resources);
        pool = createPool({ factory });

        pool.on(XPoolEvent, ({ code, message, err }) => {
          if (code !== CreateResourceOperation.FAILED) return;
          match(message, /^\[\d+\] Error creating resource: Oh Noes!$/);
          eq(err.code, ResourceCreationFailed.code);
          match(err.message, /^Error creating resource: Oh Noes!$/);
          eq(err.cause, createError);
          done();
        });

        await pool.acquire();
      });

      it('should reject when the acquire timeout is exceeded', async () => {
        const resources = [{ createDelay: 200, value: 'R1' }];
        const factory = new TestFactory(resources);
        pool = createPool({ factory, acquireTimeout: 100 });

        await rejects(() => pool.acquire(), (err) => {
          eq(err.code, OperationTimedout.code);
          return true;
        });
      });

      it('should use valid resources yielded after the acquire timeout is exceeded', async () => {
        const resources = [{ createDelay: 200, value: 'R1' }];
        const factory = new TestFactory(resources);
        pool = createPool({ factory, acquireTimeout: 100 });

        await rejects(() => pool.acquire(), (err) => {
          eq(err.code, OperationTimedout.code);
          return true;
        });

        await scheduler.wait(200);

        eq(pool.stats().acquiring, 0);
        eq(pool.stats().acquired, 0);
        eq(pool.stats().idle, 1);

        const resource = await pool.acquire();
        eq(resource, 'R1');
      });

      it('should tolerate resource validation failure', async () => {
        const resources = [{ validateError: 'Oh Noes!' }, 'R2'];
        const factory = new TestFactory(resources);
        pool = createPool({ factory });

        const resource = await pool.acquire();
        eq(resource, 'R2');
      });

      it('should report resource validation errors via a specific event', async (t, done) => {
        const validateError = new Error('Oh Noes!');
        const resources = [{ validateError }, 'R2'];
        const factory = new TestFactory(resources);
        pool = createPool({ factory });

        pool.once(ValidateResourceOperation.FAILED, ({ code, message, err }) => {
          eq(code, ValidateResourceOperation.FAILED);
          match(message, /^\[\d+\] Error validating resource: Oh Noes!$/);
          eq(err.code, ResourceValidationFailed.code);
          match(err.message, /^Error validating resource: Oh Noes!$/);
          eq(err.cause, validateError);
          done();
        });

        await pool.acquire();
      });

      it('should report resource validation errors via a general error event', async (t, done) => {
        const validateError = new Error('Oh Noes!');
        const resources = [{ validateError }, 'R2'];
        const factory = new TestFactory(resources);
        pool = createPool({ factory });

        pool.once(XPoolError, ({ code, message, err }) => {
          eq(code, ValidateResourceOperation.FAILED);
          match(message, /^\[\d+\] Error validating resource: Oh Noes!$/);
          eq(err.code, ResourceValidationFailed.code);
          match(err.message, /^Error validating resource: Oh Noes!$/);
          eq(err.cause, validateError);
          done();
        });

        await pool.acquire();
      });

      it('should report resource validation errors via a general event', async (t, done) => {
        const validateError = new Error('Oh Noes!');
        const resources = [{ validateError }, 'R2'];
        const factory = new TestFactory(resources);
        pool = createPool({ factory });

        pool.on(XPoolEvent, ({ code, message, err }) => {
          if (code !== ValidateResourceOperation.FAILED) return;
          match(message, /^\[\d+\] Error validating resource: Oh Noes!$/);
          eq(err.code, ResourceValidationFailed.code);
          match(err.message, /^Error validating resource: Oh Noes!$/);
          eq(err.cause, validateError);
          done();
        });

        await pool.acquire();
      });

      it('should destroy resources that fail validation', async (t, done) => {
        const resources = [{ validateError: 'Oh Noes!', value: 'R1' }, 'R2'];
        const factory = new TestFactory(resources);
        pool = createPool({ factory });

        pool.once(DestroyResourceOperation.SUCCEEDED, () => {
          ok(factory.wasDestroyed('R1'), 'Resource was not destroyed');
          done();
        });

        await pool.acquire();
      });

      it('should block requests once the maximum pool size has been reached', async () => {
        const resources = ['R1'];
        const factory = new TestFactory(resources);
        pool = createPool({ factory, acquireTimeout: 200, maxSize: 1 });

        await pool.acquire();

        await rejects(() => pool.acquire(), (err) => {
          eq(err.code, OperationTimedout.code);
          return true;
        });
      });

      it('should unblock requests once a resource is released', async () => {
        const resources = ['R1'];
        const factory = new TestFactory(resources);
        pool = createPool({ factory, acquireTimeout: 200, maxSize: 1 });

        const resource1 = await pool.acquire();
        setTimeout(() => pool.release(resource1), 100);

        const before = Date.now();
        const resource2 = await pool.acquire();
        const after = Date.now();

        ok(after - before >= 99, `Only waited ${(after - before)}ms for the pool to unblock`);
        eq(resource2, 'R1');
      });

      it('should unblock requests once a resource is destroyed', async () => {
        const resources = ['R1', 'R2'];
        const factory = new TestFactory(resources);
        pool = createPool({ factory, acquireTimeout: 200, maxSize: 1 });

        const resource1 = await pool.acquire();
        setTimeout(() => pool.destroy(resource1), 100);

        const before = Date.now();
        const resource2 = await pool.acquire();
        const after = Date.now();

        ok(after - before >= 99, `Only waited ${(after - before)}ms for the pool to unblock`);
        eq(resource2, 'R2');
      });

      it('should honour max queue depth', async () => {
        const resources = ['R1'];
        const factory = new TestFactory(resources);
        pool = createPool({ factory, maxSize: 1, maxQueueDepth: 3, acquireTimeout: 100 });

        await pool.acquire();

        // The following acquisitions will abort
        pool.acquire().catch(() => { });
        pool.acquire().catch(() => { });
        pool.acquire().catch(() => { });

        await rejects(() => pool.acquire(), (err) => {
          eq(err.code, MaxQueueDepthExceeded.code);
          return true;
        });
      });
    });

    describe('release', () => {

      it('should release the supplied resource', async () => {
        const resources = ['R1'];
        const factory = new TestFactory(resources);
        pool = createPool({ factory });

        const resource = await pool.acquire();
        pool.release(resource);

        const { size, acquired, idle } = pool.stats();
        eq(size, 1);
        eq(acquired, 0);
        eq(idle, 1);
      });

      it('should tolerate releasing an unmanaged resource', async () => {
        const factory = new TestFactory();
        pool = createPool({ factory });

        pool.release('XX');

        const { size, idle } = pool.stats();
        eq(size, 0);
        eq(idle, 0);
      });
    });

    describe('with', () => {

      it('should acquire a resource', async () => {
        const resources = ['R1'];
        const factory = new TestFactory(resources);
        pool = createPool({ factory });

        await pool.with(async (resource) => {
          eq(resource, 'R1');
        });
      });

      it('should yield the result', async () => {
        const resources = ['R1'];
        const factory = new TestFactory(resources);
        pool = createPool({ factory });

        const result = await pool.with(async () => 'ok');

        eq(result, 'ok');
      });

      it('should release resource', async () => {
        const resources = ['R1'];
        const factory = new TestFactory(resources);
        pool = createPool({ factory });

        await pool.with(() => { });

        const { idle } = pool.stats();
        eq(idle, 1);
      });
    });

    describe('destroy', () => {

      it('should remove the supplied resource from the pool eventually', async (t, done) => {
        const resources = ['R1'];
        const factory = new TestFactory(resources);
        pool = createPool({ factory });

        pool.on(DestroyResourceOperation.SUCCEEDED, () => {
          const { acquired, idle, destroying, size } = pool.stats();
          eq(acquired, 0);
          eq(idle, 0);
          eq(destroying, 0);
          eq(size, 0);
          done();
        });

        const resource = await pool.acquire();
        pool.destroy(resource);
      });

      it('should destroy the supplied resource eventually', async (t, done) => {
        const resources = ['R1'];
        const factory = new TestFactory(resources);
        pool = createPool({ factory });

        const resource = await pool.acquire();
        pool.destroy(resource);

        const timerId = setInterval(() => {
          if (!factory.wasDestroyed(resource)) return;
          clearInterval(timerId);
          done();
        });
      });

      it('should report resource destruction errors via a specific event', async (t, done) => {
        const destroyError = new Error('Oh Noes!');
        const resources = [{ destroyError, value: 'R1' }];
        const factory = new TestFactory(resources);
        pool = createPool({ factory });

        pool.once(DestroyResourceOperation.FAILED, ({ code, message, err }) => {
          eq(code, DestroyResourceOperation.FAILED);
          match(message, /^\[\d+\] Error destroying resource: Oh Noes!$/);
          eq(err.code, ResourceDestructionFailed.code);
          match(err.message, /^Error destroying resource: Oh Noes!$/);
          eq(err.cause, destroyError);
          done();
        });

        const resource = await pool.acquire();
        pool.destroy(resource);
      });

      it('should report resource destruction errors via a general error event', async (t, done) => {
        const destroyError = new Error('Oh Noes!');
        const resources = [{ destroyError, value: 'R1' }];
        const factory = new TestFactory(resources);
        pool = createPool({ factory });

        pool.once(XPoolError, ({ code, message, err }) => {
          eq(code, DestroyResourceOperation.FAILED);
          match(message, /^\[\d+\] Error destroying resource: Oh Noes!$/);
          eq(err.code, ResourceDestructionFailed.code);
          match(err.message, /^Error destroying resource: Oh Noes!$/);
          eq(err.cause, destroyError);
          done();
        });

        const resource = await pool.acquire();
        pool.destroy(resource);
      });

      it('should report resource destruction errors via a general event', async (t, done) => {
        const destroyError = new Error('Oh Noes!');
        const resources = [{ destroyError, value: 'R1' }];
        const factory = new TestFactory(resources);
        pool = createPool({ factory });

        pool.on(XPoolEvent, ({ code, message, err }) => {
          if (code !== DestroyResourceOperation.FAILED) return;
          match(message, /^\[\d+\] Error destroying resource: Oh Noes!$/);
          eq(err.code, ResourceDestructionFailed.code);
          match(err.message, /^Error destroying resource: Oh Noes!$/);
          eq(err.cause, destroyError);
          done();
        });

        const resource = await pool.acquire();
        pool.destroy(resource);
      });

      it('should report resource destruction timeouts', async (t, done) => {
        const resources = [{ destroyDelay: 200, value: 'R1' }];
        const factory = new TestFactory(resources);
        pool = createPool({ factory, destroyTimeout: 100 });

        pool.once(DestroyResourceOperation.FAILED, ({ code, message, err }) => {
          eq(code, DestroyResourceOperation.FAILED);
          match(message, /^\[\d+\] Destroy timedout after 100ms$/);
          eq(err.code, OperationTimedout.code);
          match(err.message, /^Destroy timedout after 100ms$/);
          done();
        });

        const resource = await pool.acquire();
        pool.destroy(resource);
      });

      it('should report resource destruction timeouts via a general error event', async (t, done) => {
        const resources = [{ destroyDelay: 200, value: 'R1' }];
        const factory = new TestFactory(resources);
        pool = createPool({ factory, destroyTimeout: 100 });

        pool.once(XPoolError, ({ code, message, err }) => {
          eq(code, DestroyResourceOperation.FAILED);
          match(message, /^\[\d+\] Destroy timedout after 100ms$/);
          eq(err.code, OperationTimedout.code);
          match(err.message, /^Destroy timedout after 100ms$/);
          done();
        });

        const resource = await pool.acquire();
        pool.destroy(resource);
      });

      it('should report resource destruction timeouts via a general event', async (t, done) => {
        const resources = [{ destroyDelay: 200, value: 'R1' }];
        const factory = new TestFactory(resources);
        pool = createPool({ factory, destroyTimeout: 100 });

        pool.on(XPoolEvent, ({ code, message, err }) => {
          if (code !== DestroyResourceOperation.FAILED) return;
          match(message, /^\[\d+\] Destroy timedout after 100ms$/);
          eq(err.code, OperationTimedout.code);
          match(err.message, /^Destroy timedout after 100ms$/);
          done();
        });

        const resource = await pool.acquire();
        pool.destroy(resource);
      });

      it('should quaranteen resources that failed to be destroyed due to error', async (t, done) => {
        const resources = [{ destroyError: 'Oh Noes!', value: 'R1' }];
        const factory = new TestFactory(resources);
        pool = createPool({ factory });

        pool.once(DestroyResourceOperation.FAILED, () => {
          const { acquired, destroying, bad, size } = pool.stats();
          eq(acquired, 0);
          eq(destroying, 0);
          eq(bad, 1);
          eq(size, 1);
          done();
        });

        const resource = await pool.acquire();
        pool.destroy(resource);
      });

      it('should quaranteen resources that failed to be destroyed due to timeout', async (t, done) => {
        const resources = [{ destroyDelay: 200, value: 'R1' }];
        const factory = new TestFactory(resources);
        pool = createPool({ factory, destroyTimeout: 100 });

        pool.once(DestroyResourceOperation.FAILED, () => {
          const { acquired, destroying, bad, size } = pool.stats();
          eq(acquired, 0);
          eq(destroying, 0);
          eq(bad, 1);
          eq(size, 1);
          done();
        });

        const resource = await pool.acquire();
        pool.destroy(resource);
      });

      it('should discard quaranteened resources that were destroyed after the timeout expired', async (t, done) => {
        const resources = [{ destroyDelay: 200, value: 'R1' }];
        const factory = new TestFactory(resources);
        pool = createPool({ factory, destroyTimeout: 100 });

        pool.once(DestroyResourceOperation.NOTICE, () => {
          const { acquired, destroying, bad, size } = pool.stats();
          eq(acquired, 0);
          eq(destroying, 0);
          eq(bad, 0);
          eq(size, 0);
          done();
        });

        const resource = await pool.acquire();
        pool.destroy(resource);
      });
    });

    describe('evictBadResources', () => {

      it('should evict bad resources', async (t, done) => {
        const resources = [{ destroyError: 'Oh Noes!', value: 'R1' }];
        const factory = new TestFactory(resources);
        pool = createPool({ factory });

        pool.once(DestroyResourceOperation.FAILED, async () => {
          eq(pool.stats().bad, 1);
          pool.evictBadResources();
          eq(pool.stats().bad, 0);
          done();
        });

        const resource = await pool.acquire();
        pool.destroy(resource);
      });
    });

    describe('stats', () => {

      it('should report stats for an empty pool', () => {
        const factory = new TestFactory();
        pool = createPool({ factory });

        const { queued, acquiring, acquired, idle, destroying, bad, size, available, peak } = pool.stats();
        eq(queued, 0);
        eq(acquiring, 0);
        eq(acquired, 0);
        eq(idle, 0);
        eq(destroying, 0);
        eq(bad, 0);
        eq(size, 0);
        eq(available, Infinity);
        eq(peak, 0);
      });

      it('should report stats for a pool with acquired resources', async () => {
        const resources = ['R1', 'R2', 'R3'];
        const factory = new TestFactory(resources);
        pool = createPool({ factory });

        await acquireResources(3);

        const { queued, acquiring, acquired, idle, destroying, bad, size, available, peak } = pool.stats();
        eq(queued, 0);
        eq(acquiring, 0);
        eq(acquired, 3);
        eq(idle, 0);
        eq(destroying, 0);
        eq(bad, 0);
        eq(size, 3);
        eq(available, Infinity);
        eq(peak, 3);
      });

      it('should report stats for a pool with idle resources', async () => {
        const resources = ['R1', 'R2', 'R3'];
        const factory = new TestFactory(resources);
        pool = createPool({ factory });

        const [resource1, resource2, resource3] = await acquireResources(3);
        await releaseResources([resource1, resource2, resource3]);

        const { queued, acquiring, acquired, idle, destroying, bad, size, available, peak } = pool.stats();
        eq(queued, 0);
        eq(acquiring, 0);
        eq(acquired, 0);
        eq(idle, 3);
        eq(destroying, 0);
        eq(bad, 0);
        eq(size, 3);
        eq(available, Infinity);
        eq(peak, 3);
      });

      it('should report stats for a pool with queued acquisition requests', async () => {
        const resources = ['R1'];
        const factory = new TestFactory(resources);
        pool = createPool({ factory, maxSize: 1 });

        await pool.acquire();

        // The following acquisitions will abort
        pool.acquire().catch(() => {});
        pool.acquire().catch(() => {});

        const { queued, acquiring, acquired, idle, destroying, bad, size, available, peak } = pool.stats();
        eq(queued, 2);
        eq(acquiring, 0);
        eq(acquired, 1);
        eq(idle, 0);
        eq(destroying, 0);
        eq(bad, 0);
        eq(size, 1);
        eq(available, 0);
        eq(peak, 1);
      });

      it('should report stats for a pool with destroying resources', async (t, done) => {
        const resources = [{ destroyDelay: 200, value: 'R1' }];
        const factory = new TestFactory(resources);
        pool = createPool({ factory });

        setTimeout(() => {
          const { queued, acquiring, acquired, idle, destroying, bad, size, available, peak } = pool.stats();
          eq(queued, 0);
          eq(acquiring, 0);
          eq(acquired, 0);
          eq(idle, 0);
          eq(destroying, 1);
          eq(bad, 0);
          eq(size, 1);
          eq(available, Infinity);
          eq(peak, 1);
          done();
        }, 100);

        const resource = await pool.acquire();
        pool.destroy(resource);
      });

      it('should report stats for a pool with bad resources', async (t, done) => {
        const resources = ['R1', { destroyError: 'Oh Noes!', value: 'R2' }, 'R3'];
        const factory = new TestFactory(resources);
        pool = createPool({ factory });

        pool.once(DestroyResourceOperation.FAILED, () => {
          const { queued, acquiring, acquired, idle, destroying, bad, size, available, peak } = pool.stats();
          eq(queued, 0);
          eq(acquiring, 0);
          eq(acquired, 0);
          eq(idle, 0);
          eq(destroying, 0);
          eq(bad, 1);
          eq(size, 1);
          eq(available, Infinity);
          eq(peak, 3);
          done();
        });

        const [resource1, resource2, resource3] = await acquireResources(3);
        await destroyResources([resource1, resource2, resource3]);
      });

      it('should report stats for a pool with a mixture of resource states', async (t, done) => {
        const resources = ['R1', 'R2', { destroyDelay: 200, value: 'R3' }, { destroyError: 'Oh Noes!', value: 'R4' }];
        const factory = new TestFactory(resources);
        pool = createPool({ factory });

        pool.once(DestroyResourceOperation.FAILED, () => {
          const { queued, acquiring, acquired, idle, destroying, bad, size, available, peak } = pool.stats();
          eq(queued, 0);
          eq(acquiring, 0);
          eq(acquired, 1);
          eq(idle, 1);
          eq(destroying, 1);
          eq(bad, 1);
          eq(size, 4);
          eq(available, Infinity);
          eq(peak, 4);
          done();
        });

        const [, resource2, resource3, resource4] = await acquireResources(4);
        pool.release(resource2);
        pool.destroy(resource3);
        pool.destroy(resource4);
      });

      it('should report stats for a pool with a mixture of resource states and a maximum pool size', async (t, done) => {
        const resources = ['R1', 'R2', { destroyDelay: 200, value: 'R3' }, { destroyError: 'Oh Noes!', value: 'R4' }];
        const factory = new TestFactory(resources);
        pool = createPool({ factory, maxSize: 10 });

        pool.once(DestroyResourceOperation.FAILED, () => {
          const { queued, acquiring, acquired, idle, destroying, bad, size, available, peak } = pool.stats();
          eq(queued, 0);
          eq(acquiring, 0);
          eq(acquired, 1);
          eq(idle, 1);
          eq(destroying, 1);
          eq(bad, 1);
          eq(size, 4);
          eq(available, 7);
          eq(peak, 4);
          done();
        });

        const [, resource2, resource3, resource4] = await acquireResources(4);
        pool.release(resource2);
        pool.destroy(resource3);
        pool.destroy(resource4);
      });

      it('should report the peak pool size', async () => {
        const resources = ['R1', 'R2', 'R3'];
        const factory = new TestFactory(resources);
        pool = createPool({ factory });

        const [resource1, resource2, resource3] = await acquireResources(3);
        await destroyResources([resource1, resource2, resource3]);

        const { queued, acquiring, acquired, idle, destroying, bad, size, available, peak } = pool.stats();
        eq(queued, 0);
        eq(acquiring, 0);
        eq(acquired, 0);
        eq(idle, 0);
        eq(destroying, 0);
        eq(bad, 0);
        eq(size, 0);
        eq(peak, 3);
        eq(available, Infinity);
      });
    });

    describe('shutdown', () => {

      it('should reject repeat shutdown requests', async () => {
        const factory = new TestFactory();
        pool = createPool({ factory });

        await pool.shutdown();

        await rejects(() => pool.shutdown(), (err) => {
          eq(err.code, PoolNotRunning.code);
          eq(err.message, 'The pool is not running');
          return true;
        });
      });

      it('should reject new acquisition requests', async () => {
        const factory = new TestFactory();
        pool = createPool({ factory });

        await pool.shutdown();

        await rejects(() => pool.acquire(), (err) => {
          eq(err.code, PoolNotRunning.code);
          eq(err.message, 'The pool is not running');
          return true;
        });
      });

      it('should reject initialisation requests', async () => {
        const factory = new TestFactory();
        pool = createPool({ factory });

        await pool.shutdown();

        await rejects(() => pool.initialise(), (err) => {
          eq(err.code, PoolNotRunning.code);
          eq(err.message, 'The pool is not running');
          return true;
        });
      });

      it('should evict bad resources', async (t, done) => {
        const resources = [{ destroyError: 'Oh Noes!', value: 'R1' }];
        const factory = new TestFactory(resources);
        pool = createPool({ factory, minSize: 1 });

        const resource = await pool.acquire();

        pool.once(DestroyResourceOperation.FAILED, async () => {
          eq(pool.stats().size, 1);
          eq(pool.stats().bad, 1);

          await pool.shutdown();

          eq(pool.stats().size, 0);
          eq(pool.stats().bad, 0);

          done();
        });

        pool.destroy(resource);
      });

      it('should destroy idle resources', async () => {
        const resources = ['R1', 'R2', 'R3', 'R4', 'R5'];
        const factory = new TestFactory(resources);
        pool = createPool({ factory, minSize: 5 });

        await pool.initialise();

        eq(pool.stats().size, 5);
        eq(pool.stats().idle, 5);

        await pool.shutdown();

        eq(pool.stats().size, 0);
        eq(pool.stats().idle, 0);

      });

      it('should wait for acquired resources to be released and destroyed', async () => {
        const resources = ['R1'];
        const factory = new TestFactory(resources);
        pool = createPool({ factory });

        const resource = await pool.acquire();

        eq(pool.stats().size, 1);
        eq(pool.stats().acquired, 1);

        setTimeout(() => pool.release(resource), 100);

        await pool.shutdown();

        eq(pool.stats().size, 0);
        eq(pool.stats().acquired, 0);
      });

      it('should wait for queued acquisitions to be honoured', async (t, done) => {
        const resources = ['R1'];
        const factory = new TestFactory(resources);
        pool = createPool({ factory, maxSize: 1 });

        // Acquire the only resource
        const resource1 = await pool.acquire();

        // Release the resource 400ms after it was acquired
        setTimeout(() => pool.release(resource1), 400);

        // Call shutdown while the resource is still on loan but after the second acquire
        setTimeout(async () => {
          const before = Date.now();
          await pool.shutdown();
          const after = Date.now();
          ok(after - before >= 399 - 200 + 200, `Only waited ${(after - before)}ms for queued acquisitions to be honoured`);
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
        pool = createPool({ factory, destroyTimeout: 200 });

        await pool.acquire();

        await rejects(() => pool.shutdown(), (err) => {
          eq(err.code, OperationTimedout.code);
          return true;
        });
      });

      it('should tolerate resource destruction errors', async () => {
        const resources = [{ destroyError: 'Oh Noes!', value: 'R1' }];
        const factory = new TestFactory(resources);
        pool = createPool({ factory, minSize: 1, destroyTimeout: 1000 });

        await pool.initialise();

        await pool.shutdown();
      });

      it('should report resource destruction errors via a specific event', async (t, done) => {
        const destroyError = new Error('Oh Noes!');
        const resources = [{ destroyError, value: 'R1' }];
        const factory = new TestFactory(resources);
        pool = createPool({ factory, minSize: 1 });

        await pool.initialise();

        pool.once(DestroyResourceOperation.FAILED, ({ code, message, err }) => {
          eq(code, DestroyResourceOperation.FAILED);
          match(message, /^\[\d+\] Error destroying resource: Oh Noes!$/);
          eq(err.code, ResourceDestructionFailed.code);
          match(err.message, /^Error destroying resource: Oh Noes!$/);
          eq(err.cause, destroyError);
          done();
        });

        await pool.shutdown();
      });

      it('should report resource destruction errors via a general error event', async (t, done) => {
        const destroyError = new Error('Oh Noes!');
        const resources = [{ destroyError, value: 'R1' }];
        const factory = new TestFactory(resources);
        pool = createPool({ factory, minSize: 1 });

        await pool.initialise();

        pool.once(XPoolError, ({ code, message, err }) => {
          eq(code, DestroyResourceOperation.FAILED);
          match(message, /^\[\d+\] Error destroying resource: Oh Noes!$/);
          eq(err.code, ResourceDestructionFailed.code);
          match(err.message, /^Error destroying resource: Oh Noes!$/);
          eq(err.cause, destroyError);
          done();
        });

        await pool.shutdown();
      });

      it('should report resource destruction errors via a general event', async (t, done) => {
        const destroyError = new Error('Oh Noes!');
        const resources = [{ destroyError, value: 'R1' }];
        const factory = new TestFactory(resources);
        pool = createPool({ factory, minSize: 1 });

        await pool.initialise();

        pool.on(XPoolEvent, ({ code, message, err }) => {
          if (code !== DestroyResourceOperation.FAILED) return;
          match(message, /^\[\d+\] Error destroying resource: Oh Noes!$/);
          eq(err.code, ResourceDestructionFailed.code);
          match(err.message, /^Error destroying resource: Oh Noes!$/);
          eq(err.cause, destroyError);
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

  function createPool({ factory, autoStart, minSize, maxSize, maxQueueDepth, initialiseTimeout, acquireTimeout = 1000, acquireRetryInterval, destroyTimeout = 1000 }) {
    return new Pool({ factory, autoStart, minSize, maxSize, maxQueueDepth, initialiseTimeout, acquireTimeout, acquireRetryInterval, destroyTimeout }).on(XPoolEvent, ({ message }) => {
      debug(message);
    });
  }

  function acquireResources(count) {
    return Promise.all(new Array(count).fill().map(() => pool.acquire()));
  }

  function releaseResources(resources) {
    return Promise.all(resources.map((r) => new Promise((resolve) => {
      pool.once(ReleaseResourceOperation.SUCCEEDED, resolve);
      pool.release(r);
    })));
  }

  function destroyResources(resources) {
    return Promise.all(resources.map((r) => new Promise((resolve) => {
      pool.once(DestroyResourceOperation.SUCCEEDED, resolve);
      pool.destroy(r);
    })));
  }
});
