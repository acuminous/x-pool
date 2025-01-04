const { describe, it, afterEach } = require('zunit');
const { deepStrictEqual: eq, rejects, fail } = require('node:assert');
const { scheduler } = require('node:timers/promises');
const { XPool, XPoolEvents } = require('..');
const PromiseUtils = require('../lib/utils/PromiseUtils');
const TestFactory = require('./lib/TestFactory');
const EventLog = require('./lib/EventLog');
const { takesAtLeast: tmin } = require('./lib/custom-assertions');

describe('Integration Tests', () => {

  describe('configuration', () => {
    it('validates min and max pool size');
  });

  describe('events', () => {
    it('should report errors thrown in custom resource handlers', async (t, done) => {
      const factory = new TestFactory([{ resource: 1 }]);
      const pool = new XPool({ factory, minPoolSize: 1 });

      pool.on(XPoolEvents.RESOURCE_CREATED, () => {
        throw new Error('Oh Noes!');
      });

      pool.on(XPoolEvents.POOL_ERROR, ({ error }) => {
        eq(error.message, 'Custom event handlers must not throw errors');
        eq(error.cause.message, 'Oh Noes!');
        done();
      });

      await pool.start();
    });

    it('should disable the pool when errors thrown in custom resource handlers', async () => {
      const factory = new TestFactory([{ resource: 1 }]);
      const pool = new XPool({ factory, minPoolSize: 1 });

      pool.on(XPoolEvents.RESOURCE_CREATED, () => {
        throw new Error('Oh Noes!');
      });

      await pool.start();

      await scheduler.wait(500);

      const operations = [
        () => pool.start(),
        () => pool.acquire(),
        () => pool.release(),
        () => pool.destroy(),
        () => pool.stop(),
      ];

      for (let i = 0; i < operations.length; i++) {
        await rejects(operations[i], (error) => {
          eq(error.message, 'The pool has been disabled');
          eq(error.cause.message, 'Custom event handlers must not throw errors');
          return true;
        });
      };
    });
  });

  describe('start', () => {

    it('should reject if the pool has already been started', async () => {
      const factory = new TestFactory();
      const pool = new XPool({ factory });
      await pool.start();

      await rejects(() => pool.start(), (error) => {
        eq(error.message, 'The pool has already been started');
        return true;
      });
    });

    it('should reject if the pool has already been stopped', async () => {
      const factory = new TestFactory();
      const pool = new XPool({ factory });

      await pool.stop();

      await rejects(() => pool.start(), (error) => {
        eq(error.message, 'The pool has already been stopped');
        return true;
      });
    });

    it('should default to no minimum pool size', async () => {
      const factory = new TestFactory([{ resource: 1 }, { resource: 2 }, { resource: 3 }]);
      const pool = new XPool({ factory });
      const eventLog = new EventLog(pool);

      await pool.start();

      eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 0, reinstating: 0, doomed: 0, timedout: 0, zombie: 0, size: 0 });
      eq(eventLog.events, [
        XPoolEvents.POOL_STARTED,
      ]);
    });

    describe('resource creation', () => {

      it('should create the specified minimum number of resources', async () => {
        const factory = new TestFactory([{ resource: 1 }, { resource: 2 }, { resource: 3 }]);
        const pool = new XPool({ factory, minPoolSize: 2 });

        await pool.start();

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 2, acquired: 0, reinstating: 0, doomed: 0, timedout: 0, zombie: 0, size: 2 });
      });

      it('should create the specified minimum number of idle resources', async () => {
        const factory = new TestFactory([{ resource: 1 }, { resource: 2 }]);
        const pool = new XPool({ factory, minIdleResources: 2 });

        await pool.start();

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 2, acquired: 0, reinstating: 0, doomed: 0, timedout: 0, zombie: 0, size: 2 });
      });

      it('should not exceed the default max concurrency', async () => {
        const factory = new TestFactory(Array.from({ length: 6 }, (_, index) => ({ resource: index, createDelay: 200 })));
        const pool = new XPool({ factory, minPoolSize: 6 });

        await tmin(() => pool.start(), 400);

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 6, acquired: 0, reinstating: 0, doomed: 0, timedout: 0, zombie: 0, size: 6 });
      });

      it('should not exceed the specified max concurrency', async () => {
        const factory = new TestFactory(Array.from({ length: 6 }, (_, index) => ({ resource: index, createDelay: 200 })));
        const pool = new XPool({ factory, minPoolSize: 6, maxConcurrency: 2 });

        await tmin(() => pool.start(), 600);

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 6, acquired: 0, reinstating: 0, doomed: 0, timedout: 0, zombie: 0, size: 6 });
      });

      it('should retry on resource creation errors', async () => {
        const factory = new TestFactory([{ resource: 1, createError: 'Oh Noes!' }, { resource: 2 }]);
        const pool = new XPool({ factory, minPoolSize: 1 });
        const eventLog = new EventLog(pool);

        await pool.start();

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 1, acquired: 0, reinstating: 0, doomed: 0, timedout: 0, zombie: 0, size: 1 });
        eq(eventLog.events, [
          XPoolEvents.RESOURCE_CREATION_ERROR,
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_RELEASED,
          XPoolEvents.POOL_STARTED,
        ]);
      });

      it('should backoff exponentially after an error creating resources', async () => {
        const factory = new TestFactory([{ createError: 'Oh Noes!' }, { createError: 'Oh Noes!' }, { createError: 'Oh Noes!' }, { resource: 4 }]);
        const pool = new XPool({ factory, minPoolSize: 1 });
        const eventLog = new EventLog(pool);

        await tmin(async () => {
          await pool.start();
        }, 100 + 200 + 400);

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 1, acquired: 0, reinstating: 0, doomed: 0, timedout: 0, zombie: 0, size: 1 });
        eq(eventLog.events, [
          XPoolEvents.RESOURCE_CREATION_ERROR,
          XPoolEvents.RESOURCE_CREATION_ERROR,
          XPoolEvents.RESOURCE_CREATION_ERROR,
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_RELEASED,
          XPoolEvents.POOL_STARTED,
        ]);
      });

      it('should honour backoff configuration', async () => {
        const factory = new TestFactory([{ createError: 'Oh Noes!' }, { createError: 'Oh Noes!' }, { createError: 'Oh Noes!' }, { resource: 4 }]);
        const pool = new XPool({ factory, minPoolSize: 1, backoffInitialValue: 50, backoffFactor: 1.5, backoffMaxValue: 100 });
        const eventLog = new EventLog(pool);

        await tmin(async () => {
          await pool.start();
        }, 50 + 75 + 100);

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 1, acquired: 0, reinstating: 0, doomed: 0, timedout: 0, zombie: 0, size: 1 });
        eq(eventLog.events, [
          XPoolEvents.RESOURCE_CREATION_ERROR,
          XPoolEvents.RESOURCE_CREATION_ERROR,
          XPoolEvents.RESOURCE_CREATION_ERROR,
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_RELEASED,
          XPoolEvents.POOL_STARTED,
        ]);
      });

      it('should segregate then destroy resources created belatedly', async () => {
        const factory = new TestFactory([{ resource: 1 }, { createDelay: 200 }, { resource: 3 }]);
        const pool = new XPool({ factory, minPoolSize: 2, createTimeout: 100, backoffMaxValue: 0 });
        const eventLog = new EventLog(pool);

        await pool.start();
        await scheduler.wait(300);

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 2, acquired: 0, reinstating: 0, doomed: 0, timedout: 0, zombie: 0, size: 2 });
        eq(eventLog.events, [
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_RELEASED,
          XPoolEvents.RESOURCE_CREATION_TIMEOUT,
          XPoolEvents.RESOURCE_SEGREGATED,
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_RELEASED,
          XPoolEvents.POOL_STARTED,
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_DESTROYED,
        ]);
      });

      it('should segregate then destroy resources created belatedly that timeout while being destroyed', async () => {
        const factory = new TestFactory([{ resource: 1, createDelay: 200, destroyDelay: 200 }, { resource: 2 }]);
        const pool = new XPool({ factory, minPoolSize: 1, createTimeout: 100, destroyTimeout: 100 });
        const eventLog = new EventLog(pool);

        await pool.start();
        await scheduler.wait(500);

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 1, acquired: 0, reinstating: 0, doomed: 0, timedout: 0, zombie: 0, size: 1 });
        eq(eventLog.events, [
          XPoolEvents.RESOURCE_CREATION_TIMEOUT,
          XPoolEvents.RESOURCE_SEGREGATED,
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_RELEASED,
          XPoolEvents.POOL_STARTED,
          XPoolEvents.RESOURCE_DESTRUCTION_TIMEOUT,
          XPoolEvents.RESOURCE_SEGREGATED,
          XPoolEvents.RESOURCE_DESTROYED,
        ]);
      });

      it('should zombie resources created belatedly that error while being destroyed', async () => {
        const factory = new TestFactory([{ resource: 1, createDelay: 200, destroyError: 'Oh Noes!' }, { resource: 2 }]);
        const pool = new XPool({ factory, minPoolSize: 1, createTimeout: 100, backoffMaxValue: 0 });
        const eventLog = new EventLog(pool);

        await pool.start();
        await scheduler.wait(300);

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 1, acquired: 0, reinstating: 0, doomed: 0, timedout: 0, zombie: 1, size: 2 });
        eq(eventLog.events, [
          XPoolEvents.RESOURCE_CREATION_TIMEOUT,
          XPoolEvents.RESOURCE_SEGREGATED,
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_RELEASED,
          XPoolEvents.POOL_STARTED,
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_DESTRUCTION_ERROR,
        ]);
      });

      it('should zombie resources created belatedly that timeout then error while being destroyed', async () => {
        const factory = new TestFactory([{ resource: 1, createDelay: 200, destroyDelay: 200, destroyError: 'Oh Noes!' }, { resource: 2 }]);
        const pool = new XPool({ factory, minPoolSize: 1, createTimeout: 100, destroyTimeout: 100, backoffMaxValue: 0 });
        const eventLog = new EventLog(pool);

        await pool.start();
        await scheduler.wait(500);

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 1, acquired: 0, reinstating: 0, doomed: 0, timedout: 0, zombie: 1, size: 2 });
        eq(eventLog.events, [
          XPoolEvents.RESOURCE_CREATION_TIMEOUT,
          XPoolEvents.RESOURCE_SEGREGATED,
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_RELEASED,
          XPoolEvents.POOL_STARTED,
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_DESTRUCTION_TIMEOUT,
          XPoolEvents.RESOURCE_SEGREGATED,
          XPoolEvents.RESOURCE_DESTRUCTION_ERROR,
        ]);
      });
    });

    describe('resource validation', () => {

      it('should validate new resources when configuration specifies ALWAYS_VALIDATE', async () => {
        const factory = new TestFactory([{ resource: 1 }]);
        const pool = new XPool({ factory, minPoolSize: 1, validate: 'ALWAYS_VALIDATE' });
        const eventLog = new EventLog(pool);

        await pool.start();
        eq(pool.stats(), { queued: 0, initialising: 0, idle: 1, acquired: 0, reinstating: 0, doomed: 0, timedout: 0, zombie: 0, size: 1 });
        eq(eventLog.events, [
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_VALIDATED,
          XPoolEvents.RESOURCE_RELEASED,
          XPoolEvents.POOL_STARTED,
        ]);
      });

      it('should validate new resources when configuration specifies VALIDATE_NEW', async () => {
        const factory = new TestFactory([{ resource: 1 }]);
        const pool = new XPool({ factory, minPoolSize: 1, validate: 'VALIDATE_NEW' });
        const eventLog = new EventLog(pool);

        await pool.start();
        eq(eventLog.events, [
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_VALIDATED,
          XPoolEvents.RESOURCE_RELEASED,
          XPoolEvents.POOL_STARTED,
        ]);

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 1, acquired: 0, reinstating: 0, doomed: 0, timedout: 0, zombie: 0, size: 1 });
      });

      it('should not validate new resources when configuration specifies VALIDATE_IDLE', async () => {
        const factory = new TestFactory([{ resource: 1 }]);
        const pool = new XPool({ factory, minPoolSize: 1, validate: 'VALIDATE_IDLE' });
        const eventLog = new EventLog(pool);

        await pool.start();

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 1, acquired: 0, reinstating: 0, doomed: 0, timedout: 0, zombie: 0, size: 1 });
        eq(eventLog.events, [
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_RELEASED,
          XPoolEvents.POOL_STARTED,
        ]);
      });

      it('should not validate created resource when configuration specifies NEVER_VALIDATE', async () => {
        const factory = new TestFactory([{ resource: 1 }]);
        const pool = new XPool({ factory, minPoolSize: 1, validate: 'NEVER_VALIDATE' });
        const eventLog = new EventLog(pool);

        await pool.start();

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 1, acquired: 0, reinstating: 0, doomed: 0, timedout: 0, zombie: 0, size: 1 });
        eq(eventLog.events, [
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_RELEASED,
          XPoolEvents.POOL_STARTED,
        ]);
      });

      it('should handle errors validating resources', async () => {
        const factory = new TestFactory([{ resource: 1, validateError: 'Oh Noes!' }, { resource: 2 }]);
        const pool = new XPool({ factory, minPoolSize: 1, validate: 'ALWAYS_VALIDATE' });
        const eventLog = new EventLog(pool);

        await pool.start();

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 1, acquired: 0, reinstating: 0, doomed: 0, timedout: 0, zombie: 0, size: 1 });
        eq(eventLog.events, [
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_VALIDATION_ERROR,
          XPoolEvents.RESOURCE_DESTROYED,
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_VALIDATED,
          XPoolEvents.RESOURCE_RELEASED,
          XPoolEvents.POOL_STARTED,
        ]);
      });

      it('should backoff exponentially after an error validating resources', async () => {
        const factory = new TestFactory([{ validateError: 'Oh Noes!' }, { validateError: 'Oh Noes!' }, { validateError: 'Oh Noes!' }, { resource: 4 }]);
        const pool = new XPool({ factory, minPoolSize: 1, validate: 'ALWAYS_VALIDATE' });
        const eventLog = new EventLog(pool);

        await tmin(async () => {
          await pool.start();
        }, 100 + 200 + 400);

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 1, acquired: 0, reinstating: 0, doomed: 0, timedout: 0, zombie: 0, size: 1 });
        eq(eventLog.events, [
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_VALIDATION_ERROR,
          XPoolEvents.RESOURCE_DESTROYED,
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_VALIDATION_ERROR,
          XPoolEvents.RESOURCE_DESTROYED,
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_VALIDATION_ERROR,
          XPoolEvents.RESOURCE_DESTROYED,
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_VALIDATED,
          XPoolEvents.RESOURCE_RELEASED,
          XPoolEvents.POOL_STARTED,
        ]);
      });

      it('should honour backoff configuration', async () => {
        const factory = new TestFactory([{ validateError: 'Oh Noes!' }, { validateError: 'Oh Noes!' }, { validateError: 'Oh Noes!' }, { resource: 4 }]);
        const pool = new XPool({ factory, minPoolSize: 1, backoffInitialValue: 50, backoffFactor: 1.5, backoffMaxValue: 100, validate: 'ALWAYS_VALIDATE' });
        const eventLog = new EventLog(pool);

        await tmin(async () => {
          await pool.start();
        }, 50 + 75 + 100);

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 1, acquired: 0, reinstating: 0, doomed: 0, timedout: 0, zombie: 0, size: 1 });
        eq(eventLog.events, [
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_VALIDATION_ERROR,
          XPoolEvents.RESOURCE_DESTROYED,
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_VALIDATION_ERROR,
          XPoolEvents.RESOURCE_DESTROYED,
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_VALIDATION_ERROR,
          XPoolEvents.RESOURCE_DESTROYED,
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_VALIDATED,
          XPoolEvents.RESOURCE_RELEASED,
          XPoolEvents.POOL_STARTED,
        ]);
      });

      it('should segregate then destroy resources validated belatedly that timeout while being destroyed', async () => {
        const factory = new TestFactory([{ resource: 1, validateDelay: 200, destroyDelay: 200 }, { resource: 2 }]);
        const pool = new XPool({ factory, minPoolSize: 1, validateTimeout: 100, destroyTimeout: 100, backoffMaxValue: 0, validate: 'ALWAYS_VALIDATE' });
        const eventLog = new EventLog(pool);

        await pool.start();
        await scheduler.wait(500);

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 1, acquired: 0, reinstating: 0, doomed: 0, timedout: 0, zombie: 0, size: 1 });
        eq(eventLog.events, [
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_VALIDATION_TIMEOUT,
          XPoolEvents.RESOURCE_SEGREGATED,
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_VALIDATED,
          XPoolEvents.RESOURCE_RELEASED,
          XPoolEvents.POOL_STARTED,
          XPoolEvents.RESOURCE_VALIDATED,
          XPoolEvents.RESOURCE_DESTRUCTION_TIMEOUT,
          XPoolEvents.RESOURCE_SEGREGATED,
          XPoolEvents.RESOURCE_DESTROYED,
        ]);
      });

      it('should zombie resources validated belatedly that error while being destroyed', async () => {
        const factory = new TestFactory([{ resource: 1, validateDelay: 200, destroyError: 'Oh Noes!' }, { resource: 2 }]);
        const pool = new XPool({ factory, minPoolSize: 1, validateTimeout: 100, backoffMaxValue: 0, validate: 'ALWAYS_VALIDATE' });
        const eventLog = new EventLog(pool);

        await pool.start();
        await scheduler.wait(300);

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 1, acquired: 0, reinstating: 0, doomed: 0, timedout: 0, zombie: 1, size: 2 });
        eq(eventLog.events, [
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_VALIDATION_TIMEOUT,
          XPoolEvents.RESOURCE_SEGREGATED,
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_VALIDATED,
          XPoolEvents.RESOURCE_RELEASED,
          XPoolEvents.POOL_STARTED,
          XPoolEvents.RESOURCE_VALIDATED,
          XPoolEvents.RESOURCE_DESTRUCTION_ERROR,
        ]);
      });

      it('should zombie resources validated belatedly that timeout then error while being destroyed', async () => {
        const factory = new TestFactory([{ resource: 1, validateDelay: 200, destroyDelay: 200, destroyError: 'Oh Noes!' }, { resource: 2 }]);
        const pool = new XPool({ factory, minPoolSize: 1, validateTimeout: 100, destroyTimeout: 100, backoffMaxValue: 0, validate: 'ALWAYS_VALIDATE' });
        const eventLog = new EventLog(pool);

        await pool.start();
        await scheduler.wait(500);

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 1, acquired: 0, reinstating: 0, doomed: 0, timedout: 0, zombie: 1, size: 2 });
        eq(eventLog.events, [
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_VALIDATION_TIMEOUT,
          XPoolEvents.RESOURCE_SEGREGATED,
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_VALIDATED,
          XPoolEvents.RESOURCE_RELEASED,
          XPoolEvents.POOL_STARTED,
          XPoolEvents.RESOURCE_VALIDATED,
          XPoolEvents.RESOURCE_DESTRUCTION_TIMEOUT,
          XPoolEvents.RESOURCE_SEGREGATED,
          XPoolEvents.RESOURCE_DESTRUCTION_ERROR,
        ]);
      });
    });

    describe('start timeout', () => {

      it('should reject if the start times out during resource creation', async () => {
        const factory = new TestFactory([{ resource: 1, createDelay: 200 }]);
        const pool = new XPool({ factory, minPoolSize: 1, startTimeout: 100 });

        await rejects(() => pool.start(), (error) => {
          eq(error.message, 'Failed to start pool within 100ms');
          return true;
        });
      });

      it('should segregate resources created belatedly if start times out during resource creation', async () => {
        const factory = new TestFactory([{ resource: 1, createDelay: 200 }]);
        const pool = new XPool({ factory, minPoolSize: 1, startTimeout: 100 });
        const eventLog = new EventLog(pool);

        await rejects(() => pool.start(), (error) => {
          eq(error.message, 'Failed to start pool within 100ms');
          return true;
        });

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 0, reinstating: 0, doomed: 0, timedout: 1, zombie: 0, size: 1 });
        eq(eventLog.events, [
          XPoolEvents.RESOURCE_SEGREGATED,
          XPoolEvents.RESOURCE_CREATION_ABANDONED,
        ]);
      });

      it('should reject if the start times out during resource validation', async () => {
        const factory = new TestFactory([{ resource: 1, validateDelay: 200 }]);
        const pool = new XPool({ factory, minPoolSize: 1, startTimeout: 100, validate: 'ALWAYS_VALIDATE' });

        await rejects(() => pool.start(), (error) => {
          eq(error.message, 'Failed to start pool within 100ms');
          return true;
        });
      });

      it('should segregate then destroy resources validated belatedly if start times out during resource validation', async () => {
        const factory = new TestFactory([{ resource: 1, validateDelay: 200 }]);
        const pool = new XPool({ factory, minPoolSize: 1, startTimeout: 100, validate: 'ALWAYS_VALIDATE' });
        const eventLog = new EventLog(pool);

        await rejects(() => pool.start(), (error) => {
          eq(error.message, 'Failed to start pool within 100ms');
          return true;
        });

        await scheduler.wait(200);

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 0, reinstating: 0, doomed: 0, timedout: 0, zombie: 0, size: 0 });
        eq(eventLog.events, [
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_SEGREGATED,
          XPoolEvents.RESOURCE_VALIDATION_ABANDONED,
          XPoolEvents.RESOURCE_VALIDATED,
          XPoolEvents.RESOURCE_DESTROYED,
        ]);
      });
    });
  });

  describe('stop', () => {

    afterEach(async () => {
      await scheduler.wait(500);
    });

    it('should wait for the pool to finish initialising', async () => {
      const factory = new TestFactory([{ resource: 1, createDelay: 100 }, { resource: 2, createDelay: 100 }, { resource: 3, createDelay: 100 }]);
      const pool = new XPool({ factory, minPoolSize: 3 });

      pool.start();
      await pool.stop();

      eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 0, reinstating: 0, doomed: 0, timedout: 0, zombie: 0, size: 0 });
    });

    it('should reject subsequent acquisition requests', async () => {
      const factory = new TestFactory([{ resource: 1 }]);
      const pool = new XPool({ factory });

      await pool.start();
      await pool.stop();

      await rejects(pool.acquire(), (error) => {
        eq(error.message, 'The pool has been stopped');
        return true;
      });

      eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 0, reinstating: 0, doomed: 0, timedout: 0, zombie: 0, size: 0 });
    });

    it('should destroy idle resources', async () => {
      const factory = new TestFactory([{ resource: 1 }, { resource: 2 }, { resource: 3 }]);
      const pool = new XPool({ factory, minPoolSize: 3 });
      const eventLog = new EventLog(pool);

      await pool.start();
      await pool.stop();

      eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 0, reinstating: 0, doomed: 0, timedout: 0, zombie: 0, size: 0 });
      eq(eventLog.events, [
        XPoolEvents.RESOURCE_CREATED,
        XPoolEvents.RESOURCE_CREATED,
        XPoolEvents.RESOURCE_CREATED,
        XPoolEvents.RESOURCE_RELEASED,
        XPoolEvents.RESOURCE_RELEASED,
        XPoolEvents.RESOURCE_RELEASED,
        XPoolEvents.POOL_STARTED,
        XPoolEvents.RESOURCE_DESTROYED,
        XPoolEvents.RESOURCE_DESTROYED,
        XPoolEvents.RESOURCE_DESTROYED,
        XPoolEvents.POOL_STOPPED,
      ]);
    });

    it('should not destroy segregated resources', async () => {
      const factory = new TestFactory([{ resource: 1, createDelay: 200 }]);
      const pool = new XPool({ factory, minPoolSize: 1, startTimeout: 100 });
      const eventLog = new EventLog(pool);

      await rejects(pool.start(), (error) => {
        eq(error.message, 'Failed to start pool within 100ms');
        return true;
      });

      await pool.stop();

      eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 0, reinstating: 0, doomed: 0, timedout: 1, zombie: 0, size: 1 });
      eq(eventLog.events, [
        XPoolEvents.RESOURCE_SEGREGATED,
        XPoolEvents.RESOURCE_CREATION_ABANDONED,
        XPoolEvents.POOL_STOPPED,
      ]);
    });

    it('should wait for queued requests to complete before destroying idle resources', async () => {
      const factory = new TestFactory([{ resource: 1 }]);
      const pool = new XPool({ factory, minPoolSize: 1, maxPoolSize: 1 });
      const eventLog = new EventLog(pool);

      await pool.start();

      const events = [
        XPoolEvents.RESOURCE_CREATED,
        XPoolEvents.RESOURCE_RELEASED,
        XPoolEvents.POOL_STARTED,
      ];
      PromiseUtils.times(11, async () => {
        events.push(XPoolEvents.RESOURCE_ACQUIRED, XPoolEvents.RESOURCE_RELEASED);
        const resource = await pool.acquire();
        setTimeout(() => pool.release(resource), 100);
      }).then(() => {
        events.push(XPoolEvents.RESOURCE_DESTROYED);
        events.push(XPoolEvents.POOL_STOPPED);
      });

      await scheduler.wait(50);

      await pool.stop();

      eq(eventLog.events, events);
    });

    it('should wait for dispatched requests to complete before destroying idle resources');

    it('should wait for resources that are being destroyed but havent timed out [could happen if start or acquire times out]');

    it('should wait for resources that are being reset');

    it('should segregate resources that timeout while being destroyed', async () => {
      const factory = new TestFactory([{ resource: 1, destroyDelay: 200 }]);
      const pool = new XPool({ factory, minPoolSize: 1, destroyTimeout: 100 });
      const eventLog = new EventLog(pool);

      await pool.start();
      await pool.stop();

      eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 0, reinstating: 0, doomed: 0, timedout: 1, zombie: 0, size: 1 });
      eq(eventLog.events, [
        XPoolEvents.RESOURCE_CREATED,
        XPoolEvents.RESOURCE_RELEASED,
        XPoolEvents.POOL_STARTED,
        XPoolEvents.RESOURCE_DESTRUCTION_TIMEOUT,
        XPoolEvents.RESOURCE_SEGREGATED,
        XPoolEvents.POOL_STOPPED,
      ]);
    });

    it('should tolerate belated destruction of resources that timeout while being destroyed', async () => {
      const factory = new TestFactory([{ resource: 1, destroyDelay: 200 }]);
      const pool = new XPool({ factory, minPoolSize: 1, destroyTimeout: 100 });
      const eventLog = new EventLog(pool);

      await pool.start();
      await pool.stop();
      await scheduler.wait(200);

      eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 0, reinstating: 0, doomed: 0, timedout: 0, zombie: 0, size: 0 });
      eq(eventLog.events, [
        XPoolEvents.RESOURCE_CREATED,
        XPoolEvents.RESOURCE_RELEASED,
        XPoolEvents.POOL_STARTED,
        XPoolEvents.RESOURCE_DESTRUCTION_TIMEOUT,
        XPoolEvents.RESOURCE_SEGREGATED,
        XPoolEvents.POOL_STOPPED,
        XPoolEvents.RESOURCE_DESTROYED,
      ]);
    });

    it('should zombie resources that error while being destroyed', async () => {
      const factory = new TestFactory([{ resource: 1, destroyError: 'Oh Noes!' }]);
      const pool = new XPool({ factory, minPoolSize: 1 });
      const eventLog = new EventLog(pool);

      await pool.start();
      await pool.stop();

      eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 0, reinstating: 0, doomed: 0, timedout: 0, zombie: 1, size: 1 });
      eq(eventLog.events, [
        XPoolEvents.RESOURCE_CREATED,
        XPoolEvents.RESOURCE_RELEASED,
        XPoolEvents.POOL_STARTED,
        XPoolEvents.RESOURCE_DESTRUCTION_ERROR,
        XPoolEvents.POOL_STOPPED,
      ]);
    });

    it('should tolerate stopping a pool that has not been started', async () => {
      const factory = new TestFactory();
      const pool = new XPool({ factory });

      await pool.stop();

      eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 0, reinstating: 0, doomed: 0, timedout: 0, zombie: 0, size: 0 });
    });

    it('should tolerate concurrent attempts to stop a pool', async () => {
      const factory = new TestFactory([{ resource: 1 }]);
      const pool = new XPool({ factory, minPoolSize: 1 });
      const eventLog = new EventLog(pool);

      await pool.start();
      await Promise.all([pool.stop(), pool.stop(), pool.stop()]);

      eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 0, reinstating: 0, doomed: 0, timedout: 0, zombie: 0, size: 0 });
      eq(eventLog.events, [
        XPoolEvents.RESOURCE_CREATED,
        XPoolEvents.RESOURCE_RELEASED,
        XPoolEvents.POOL_STARTED,
        XPoolEvents.RESOURCE_DESTROYED,
        XPoolEvents.POOL_STOPPED,
      ]);
    });

    it('should reject if the stop times out', async () => {
      const factory = new TestFactory([{ resource: 1, destroyDelay: 200 }]);
      const pool = new XPool({ factory, minPoolSize: 1, stopTimeout: 100 });

      await pool.start();
      await rejects(() => pool.stop(), (error) => {
        eq(error.message, 'Failed to stop pool within 100ms');
        return true;
      });

      eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 0, reinstating: 0, doomed: 1, timedout: 0, zombie: 0, size: 1 });
    });

    it('should not wait for segregated resources');

    it('should not wait for zombied resources');
  });

  describe('acquire', () => {

    it('should start the pool if not already started', async () => {
      const factory = new TestFactory([{ resource: 1 }]);
      const pool = new XPool({ factory });
      const eventLog = new EventLog(pool);

      const resource = await pool.acquire();
      eq(resource, 1);

      eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 1, reinstating: 0, doomed: 0, timedout: 0, zombie: 0, size: 1 });
      eq(eventLog.events, [
        XPoolEvents.POOL_STARTED,
        XPoolEvents.RESOURCE_CREATED,
        XPoolEvents.RESOURCE_ACQUIRED,
      ]);
    });

    describe('idle resources', () => {

      it('should prefer idle resources', async () => {
        const factory = new TestFactory([{ resource: 1 }]);
        const pool = new XPool({ factory, minPoolSize: 1 });
        const eventLog = new EventLog(pool);

        await pool.start();
        const resource = await pool.acquire();
        eq(resource, 1);

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 1, reinstating: 0, doomed: 0, timedout: 0, zombie: 0, size: 1 });
        eq(eventLog.events, [
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_RELEASED,
          XPoolEvents.POOL_STARTED,
          XPoolEvents.RESOURCE_ACQUIRED,
        ]);
      });

      it('should maintain the minimum number of idle resources', async () => {
        const factory = new TestFactory([{ resource: 1 }, { resource: 2 }, { resource: 3 }]);
        const pool = new XPool({ factory, minIdleResources: 2 });
        const eventLog = new EventLog(pool);

        await pool.start();
        await pool.acquire();

        await scheduler.wait(100);

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 2, acquired: 1, reinstating: 0, doomed: 0, timedout: 0, zombie: 0, size: 3 });
        eq(eventLog.events, [
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_RELEASED,
          XPoolEvents.RESOURCE_RELEASED,
          XPoolEvents.POOL_STARTED,
          XPoolEvents.RESOURCE_ACQUIRED,
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_RELEASED,
        ]);
      });
    });

    describe('resource creation', () => {

      it('should create a new resource if the pool is empty', async () => {
        const factory = new TestFactory([{ resource: 1 }]);
        const pool = new XPool({ factory });
        const eventLog = new EventLog(pool);

        const resource = await pool.acquire();

        eq(resource, 1);

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 1, reinstating: 0, doomed: 0, timedout: 0, zombie: 0, size: 1 });
        eq(eventLog.events, [
          XPoolEvents.POOL_STARTED,
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_ACQUIRED,
        ]);
      });

      it('should create a new resource if all resources have been acquired', async () => {
        const factory = new TestFactory([{ resource: 1 }, { resource: 2 }]);
        const pool = new XPool({ factory });
        const eventLog = new EventLog(pool);

        const resource1 = await pool.acquire();
        eq(resource1, 1);

        const resource2 = await pool.acquire();
        eq(resource2, 2);

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 2, reinstating: 0, doomed: 0, timedout: 0, zombie: 0, size: 2 });
        eq(eventLog.events, [
          XPoolEvents.POOL_STARTED,
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_ACQUIRED,
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_ACQUIRED,
        ]);
      });

      it('should wait until there is an idle resource if the pool has no spare capacity', async () => {
        const factory = new TestFactory([{ resource: 1 }]);
        const pool = new XPool({ factory, maxPoolSize: 1 });
        const eventLog = new EventLog(pool);

        const resource = await pool.acquire();

        await tmin(async () => {
          setTimeout(() => pool.release(resource), 100);
          await pool.acquire();
        }, 99);

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 1, reinstating: 0, doomed: 0, timedout: 0, zombie: 0, size: 1 });
        eq(eventLog.events, [
          XPoolEvents.POOL_STARTED,
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_ACQUIRED,
          XPoolEvents.RESOURCE_RELEASED,
          XPoolEvents.RESOURCE_ACQUIRED,
        ]);
      });

      it('should reject if the maximum queue depth is exceeded', async () => {
        const factory = new TestFactory([{ resource: 1 }]);
        const pool = new XPool({ factory, maxPoolSize: 1, maxQueueSize: 1 });
        const eventLog = new EventLog(pool);

        // Acquire 1 is dispatched
        // Acquire 2 will be queued, eventually timing out because Acquire 1 is never released
        // Acquire 3 should be rejected because the maximum queue size would be exceeded

        await pool.acquire();
        pool.acquire().catch(() => {});
        await rejects(() => pool.acquire(), (error) => {
          eq(error.message, 'Maximum queue size of 1 exceeded');
          return true;
        });

        eq(pool.stats(), { queued: 1, initialising: 0, idle: 0, acquired: 1, reinstating: 0, doomed: 0, timedout: 0, zombie: 0, size: 1 });
        eq(eventLog.events, [
          XPoolEvents.POOL_STARTED,
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_ACQUIRED,
        ]);
      });

      it('should default to no maximum queue depth', async () => {
        const factory = new TestFactory([{ resource: 1 }]);
        const pool = new XPool({ factory, maxPoolSize: 1 });

        const resource = await pool.acquire();
        const done = PromiseUtils.times(1000, async () => {
          const resource = await pool.acquire();
          await pool.release(resource);
        });

        await scheduler.wait(100);

        eq(pool.stats(), { queued: 1000, initialising: 0, idle: 0, acquired: 1, reinstating: 0, doomed: 0, timedout: 0, zombie: 0, size: 1 });
        pool.release(resource);
        await done;
      });

      it('should retry on resource creation errors', async () => {
        const factory = new TestFactory([{ createError: 'Oh Noes!' }, { resource: 2 }]);
        const pool = new XPool({ factory });
        const eventLog = new EventLog(pool);

        const resource = await pool.acquire();
        eq(resource, 2);

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 1, reinstating: 0, doomed: 0, timedout: 0, zombie: 0, size: 1 });
        eq(eventLog.events, [
          XPoolEvents.POOL_STARTED,
          XPoolEvents.RESOURCE_CREATION_ERROR,
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_ACQUIRED,
        ]);
      });

      it('should backoff exponentially after an error creating resources', async () => {
        const factory = new TestFactory([{ createError: 'Oh Noes!' }, { createError: 'Oh Noes!' }, { createError: 'Oh Noes!' }, { resource: 4 }]);
        const pool = new XPool({ factory });
        const eventLog = new EventLog(pool);

        await tmin(async () => {
          await pool.acquire();
        }, 100 + 200 + 400);

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 1, reinstating: 0, doomed: 0, timedout: 0, zombie: 0, size: 1 });
        eq(eventLog.events, [
          XPoolEvents.POOL_STARTED,
          XPoolEvents.RESOURCE_CREATION_ERROR,
          XPoolEvents.RESOURCE_CREATION_ERROR,
          XPoolEvents.RESOURCE_CREATION_ERROR,
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_ACQUIRED,
        ]);
      });

      it('should honour backoff configuration', async () => {
        const factory = new TestFactory([{ createError: 'Oh Noes!' }, { createError: 'Oh Noes!' }, { createError: 'Oh Noes!' }, { resource: 4 }]);
        const pool = new XPool({ factory, backoffInitialValue: 50, backoffFactor: 1.5, backoffMaxValue: 100 });
        const eventLog = new EventLog(pool);

        await tmin(async () => {
          await pool.acquire();
        }, 50 + 75 + 100);

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 1, reinstating: 0, doomed: 0, timedout: 0, zombie: 0, size: 1 });
        eq(eventLog.events, [
          XPoolEvents.POOL_STARTED,
          XPoolEvents.RESOURCE_CREATION_ERROR,
          XPoolEvents.RESOURCE_CREATION_ERROR,
          XPoolEvents.RESOURCE_CREATION_ERROR,
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_ACQUIRED,
        ]);
      });

      it('should segregate then destroy resources that timeout, then are created belatedly', async () => {
        const factory = new TestFactory([{ resource: 1, createDelay: 200 }, { resource: 2 }]);
        const pool = new XPool({ factory, createTimeout: 100, backoffMaxValue: 100 });
        const eventLog = new EventLog(pool);

        await pool.acquire();
        await scheduler.wait(300);

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 1, reinstating: 0, doomed: 0, timedout: 0, zombie: 0, size: 1 });
        eq(eventLog.events, [
          XPoolEvents.POOL_STARTED,
          XPoolEvents.RESOURCE_CREATION_TIMEOUT,
          XPoolEvents.RESOURCE_SEGREGATED,
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_DESTROYED,
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_ACQUIRED,
        ]);
      });

      it('should segregate then destroy resources that timeout, then are created belatedly, but then timeout when being destroyed', async () => {
        const factory = new TestFactory([{ resource: 1, createDelay: 200, destroyDelay: 200 }, { resource: 2 }]);
        const pool = new XPool({ factory, createTimeout: 100, destroyTimeout: 100, backoffMaxValue: 0 });
        const eventLog = new EventLog(pool);

        await pool.acquire();
        await scheduler.wait(500);

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 1, reinstating: 0, doomed: 0, timedout: 0, zombie: 0, size: 1 });
        eq(eventLog.events, [
          XPoolEvents.POOL_STARTED,
          XPoolEvents.RESOURCE_CREATION_TIMEOUT,
          XPoolEvents.RESOURCE_SEGREGATED,
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_ACQUIRED,
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_DESTRUCTION_TIMEOUT,
          XPoolEvents.RESOURCE_SEGREGATED,
          XPoolEvents.RESOURCE_DESTROYED,
        ]);
      });

      it('should zombie resources that timeout, then are created belatedly, but then error when being destroyed', async () => {
        const factory = new TestFactory([{ resource: 1, createDelay: 200, destroyError: 'Oh Noes!' }, { resource: 2 }]);
        const pool = new XPool({ factory, createTimeout: 100, backoffMaxValue: 0 });
        const eventLog = new EventLog(pool);

        await pool.acquire();
        await scheduler.wait(300);

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 1, reinstating: 0, doomed: 0, timedout: 0, zombie: 1, size: 2 });
        eq(eventLog.events, [
          XPoolEvents.POOL_STARTED,
          XPoolEvents.RESOURCE_CREATION_TIMEOUT,
          XPoolEvents.RESOURCE_SEGREGATED,
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_ACQUIRED,
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_DESTRUCTION_ERROR,
        ]);
      });

      it('should zombie resources that timeout, then are created belatedly, but then timeout and error when being destroyed', async () => {
        const factory = new TestFactory([{ resource: 1, createDelay: 200, destroyDelay: 200, destroyError: 'Oh Noes!' }, { resource: 2 }]);
        const pool = new XPool({ factory, createTimeout: 100, destroyTimeout: 100, backoffMaxValue: 0 });
        const eventLog = new EventLog(pool);

        await pool.acquire();
        await scheduler.wait(500);

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 1, reinstating: 0, doomed: 0, timedout: 0, zombie: 1, size: 2 });
        eq(eventLog.events, [
          XPoolEvents.POOL_STARTED,
          XPoolEvents.RESOURCE_CREATION_TIMEOUT,
          XPoolEvents.RESOURCE_SEGREGATED,
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_ACQUIRED,
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_DESTRUCTION_TIMEOUT,
          XPoolEvents.RESOURCE_SEGREGATED,
          XPoolEvents.RESOURCE_DESTRUCTION_ERROR,
        ]);
      });

      it('should create a resource when the pool is at capacity once space becomes through resource is destruction', async () => {
        const factory = new TestFactory([{ resource: 1, createDelay: 200 }, { resource: 2 }]);
        const pool = new XPool({ factory, maxPoolSize: 1, createTimeout: 100, backoffMaxValue: 0 });
        const eventLog = new EventLog(pool);

        await pool.acquire();
        await scheduler.wait(500);

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 1, reinstating: 0, doomed: 0, timedout: 0, zombie: 0, size: 1 });
        eq(eventLog.events, [
          XPoolEvents.POOL_STARTED,
          XPoolEvents.RESOURCE_CREATION_TIMEOUT,
          XPoolEvents.RESOURCE_SEGREGATED,
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_DESTROYED,
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_ACQUIRED,
        ]);
      });
    });

    describe('resource validation', () => {

      it('should validate created resources when configuration specifies ALWAYS_VALIDATE', async () => {
        const factory = new TestFactory([{ resource: 1 }]);
        const pool = new XPool({ factory, validate: 'ALWAYS_VALIDATE' });
        const eventLog = new EventLog(pool);

        await pool.acquire();

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 1, reinstating: 0, doomed: 0, timedout: 0, zombie: 0, size: 1 });
        eq(eventLog.events, [
          XPoolEvents.POOL_STARTED,
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_VALIDATED,
          XPoolEvents.RESOURCE_ACQUIRED,
        ]);
      });

      it('should validate idle resources when configuration specifies ALWAYS_VALIDATE', async () => {
        const factory = new TestFactory([{ resource: 1 }]);
        const pool = new XPool({ factory, minPoolSize: 1, validate: 'ALWAYS_VALIDATE' });
        const eventLog = new EventLog(pool);

        await pool.start();
        await pool.acquire();

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 1, reinstating: 0, doomed: 0, timedout: 0, zombie: 0, size: 1 });
        eq(eventLog.events, [
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_VALIDATED,
          XPoolEvents.RESOURCE_RELEASED,
          XPoolEvents.POOL_STARTED,
          XPoolEvents.RESOURCE_VALIDATED,
          XPoolEvents.RESOURCE_ACQUIRED,
        ]);
      });

      it('should validate created resources when configuration specifies CREATE', async () => {
        const factory = new TestFactory([{ resource: 1 }]);
        const pool = new XPool({ factory, validate: 'VALIDATE_NEW' });
        const eventLog = new EventLog(pool);

        await pool.acquire();

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 1, reinstating: 0, doomed: 0, timedout: 0, zombie: 0, size: 1 });
        eq(eventLog.events, [
          XPoolEvents.POOL_STARTED,
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_VALIDATED,
          XPoolEvents.RESOURCE_ACQUIRED,
        ]);
      });

      it('should not validate idle resources when configuration specifies CREATE', async () => {
        const factory = new TestFactory([{ resource: 1 }]);
        const pool = new XPool({ factory, minPoolSize: 1, validate: 'VALIDATE_NEW' });
        const eventLog = new EventLog(pool);

        await pool.start();
        await pool.acquire();

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 1, reinstating: 0, doomed: 0, timedout: 0, zombie: 0, size: 1 });
        eq(eventLog.events, [
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_VALIDATED,
          XPoolEvents.RESOURCE_RELEASED,
          XPoolEvents.POOL_STARTED,
          XPoolEvents.RESOURCE_ACQUIRED,
        ]);
      });

      it('should not validate created resources when configuration specifies VALIDATE_IDLE', async () => {
        const factory = new TestFactory([{ resource: 1 }]);
        const pool = new XPool({ factory, validate: 'VALIDATE_IDLE' });
        const eventLog = new EventLog(pool);

        await pool.acquire();

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 1, reinstating: 0, doomed: 0, timedout: 0, zombie: 0, size: 1 });
        eq(eventLog.events, [
          XPoolEvents.POOL_STARTED,
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_ACQUIRED,
        ]);
      });

      it('should validate idle resources when configuration specifies VALIDATE_IDLE', async () => {
        const factory = new TestFactory([{ resource: 1 }]);
        const pool = new XPool({ factory, minPoolSize: 1, validate: 'VALIDATE_IDLE' });
        const eventLog = new EventLog(pool);

        await pool.start();
        await pool.acquire();

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 1, reinstating: 0, doomed: 0, timedout: 0, zombie: 0, size: 1 });
        eq(eventLog.events, [
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_RELEASED,
          XPoolEvents.POOL_STARTED,
          XPoolEvents.RESOURCE_VALIDATED,
          XPoolEvents.RESOURCE_ACQUIRED,
        ]);
      });

      it('should not validate created resources when configuration specifies NEVER_VALIDATE', async () => {
        const factory = new TestFactory([{ resource: 1 }]);
        const pool = new XPool({ factory, validate: 'NEVER_VALIDATE' });
        const eventLog = new EventLog(pool);

        await pool.acquire();

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 1, reinstating: 0, doomed: 0, timedout: 0, zombie: 0, size: 1 });
        eq(eventLog.events, [
          XPoolEvents.POOL_STARTED,
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_ACQUIRED,
        ]);
      });

      it('should not validate idle resources when configuration specifies NEVER_VALIDATE', async () => {
        const factory = new TestFactory([{ resource: 1 }]);
        const pool = new XPool({ factory, minPoolSize: 1, validate: 'NEVER_VALIDATE' });
        const eventLog = new EventLog(pool);

        await pool.start();
        await pool.acquire();

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 1, reinstating: 0, doomed: 0, timedout: 0, zombie: 0, size: 1 });
        eq(eventLog.events, [
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_RELEASED,
          XPoolEvents.POOL_STARTED,
          XPoolEvents.RESOURCE_ACQUIRED,
        ]);
      });

      it('should retry on resource validation errors', async () => {
        const factory = new TestFactory([{ resource: 1, validateError: 'Oh Noes!' }, { resource: 2 }]);
        const pool = new XPool({ factory, validate: 'ALWAYS_VALIDATE' });
        const eventLog = new EventLog(pool);

        await pool.acquire();

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 1, reinstating: 0, doomed: 0, timedout: 0, zombie: 0, size: 1 });
        eq(eventLog.events, [
          XPoolEvents.POOL_STARTED,
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_VALIDATION_ERROR,
          XPoolEvents.RESOURCE_DESTROYED,
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_VALIDATED,
          XPoolEvents.RESOURCE_ACQUIRED,
        ]);
      });

      it('should backoff exponentially after an error validating resources', async () => {
        const factory = new TestFactory([{ validateError: 'Oh Noes!' }, { validateError: 'Oh Noes!' }, { validateError: 'Oh Noes!' }, { resource: 4 }]);
        const pool = new XPool({ factory, validate: 'ALWAYS_VALIDATE' });
        const eventLog = new EventLog(pool);

        await tmin(async () => {
          await pool.acquire();
        }, 100 + 200 + 400);

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 1, reinstating: 0, doomed: 0, timedout: 0, zombie: 0, size: 1 });
        eq(eventLog.events, [
          XPoolEvents.POOL_STARTED,
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_VALIDATION_ERROR,
          XPoolEvents.RESOURCE_DESTROYED,
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_VALIDATION_ERROR,
          XPoolEvents.RESOURCE_DESTROYED,
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_VALIDATION_ERROR,
          XPoolEvents.RESOURCE_DESTROYED,
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_VALIDATED,
          XPoolEvents.RESOURCE_ACQUIRED,
        ]);
      });

      it('should honour backoff configuration', async () => {
        const factory = new TestFactory([{ validateError: 'Oh Noes!' }, { validateError: 'Oh Noes!' }, { validateError: 'Oh Noes!' }, { resource: 4 }]);
        const pool = new XPool({ factory, backoffInitialValue: 50, backoffFactor: 1.5, backoffMaxValue: 100, validate: 'ALWAYS_VALIDATE' });
        const eventLog = new EventLog(pool);

        await tmin(async () => {
          await pool.acquire();
        }, 50 + 75 + 100);

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 1, reinstating: 0, doomed: 0, timedout: 0, zombie: 0, size: 1 });
        eq(eventLog.events, [
          XPoolEvents.POOL_STARTED,
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_VALIDATION_ERROR,
          XPoolEvents.RESOURCE_DESTROYED,
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_VALIDATION_ERROR,
          XPoolEvents.RESOURCE_DESTROYED,
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_VALIDATION_ERROR,
          XPoolEvents.RESOURCE_DESTROYED,
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_VALIDATED,
          XPoolEvents.RESOURCE_ACQUIRED,
        ]);
      });

      it('should segregate then destroy resources that timeout, then are validated belatedly', async () => {
        const factory = new TestFactory([{ resource: 1, validateDelay: 200 }, { resource: 2 }]);
        const pool = new XPool({ factory, validateTimeout: 100, backoffMaxValue: 100, validate: 'ALWAYS_VALIDATE' });
        const eventLog = new EventLog(pool);

        await pool.acquire();
        await scheduler.wait(300);

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 1, reinstating: 0, doomed: 0, timedout: 0, zombie: 0, size: 1 });
        eq(eventLog.events, [
          XPoolEvents.POOL_STARTED,
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_VALIDATION_TIMEOUT,
          XPoolEvents.RESOURCE_SEGREGATED,
          XPoolEvents.RESOURCE_VALIDATED,
          XPoolEvents.RESOURCE_DESTROYED,
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_VALIDATED,
          XPoolEvents.RESOURCE_ACQUIRED,
        ]);
      });

      it('should segregate then destroy resources that timeout, then are validated belatedly, but thne timeout when being destroyed', async () => {
        const factory = new TestFactory([{ resource: 1, validateDelay: 200, destroyDelay: 200 }, { resource: 2 }]);
        const pool = new XPool({ factory, validateTimeout: 100, destroyTimeout: 100, backoffMaxValue: 0, validate: 'ALWAYS_VALIDATE' });
        const eventLog = new EventLog(pool);

        await pool.acquire();
        await scheduler.wait(500);

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 1, reinstating: 0, doomed: 0, timedout: 0, zombie: 0, size: 1 });
        eq(eventLog.events, [
          XPoolEvents.POOL_STARTED,
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_VALIDATION_TIMEOUT,
          XPoolEvents.RESOURCE_SEGREGATED,
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_VALIDATED,
          XPoolEvents.RESOURCE_ACQUIRED,
          XPoolEvents.RESOURCE_VALIDATED,
          XPoolEvents.RESOURCE_DESTRUCTION_TIMEOUT,
          XPoolEvents.RESOURCE_SEGREGATED,
          XPoolEvents.RESOURCE_DESTROYED,
        ]);
      });

      it('should zombie resources that timeout, then are validated belatedly, but that error when being destroyed', async () => {
        const factory = new TestFactory([{ resource: 1, validateDelay: 200, destroyError: 'Oh Noes!' }, { resource: 2 }]);
        const pool = new XPool({ factory, validateTimeout: 100, backoffMaxValue: 0, validate: 'ALWAYS_VALIDATE' });
        const eventLog = new EventLog(pool);

        await pool.acquire();
        await scheduler.wait(300);

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 1, reinstating: 0, doomed: 0, timedout: 0, zombie: 1, size: 2 });
        eq(eventLog.events, [
          XPoolEvents.POOL_STARTED,
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_VALIDATION_TIMEOUT,
          XPoolEvents.RESOURCE_SEGREGATED,
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_VALIDATED,
          XPoolEvents.RESOURCE_ACQUIRED,
          XPoolEvents.RESOURCE_VALIDATED,
          XPoolEvents.RESOURCE_DESTRUCTION_ERROR,
        ]);
      });

      it('should zombie resources that timeout, then are validated belatedly, but that timeout and error when being destroyed', async () => {
        const factory = new TestFactory([{ resource: 1, validateDelay: 200, destroyDelay: 200, destroyError: 'Oh Noes!' }, { resource: 2 }]);
        const pool = new XPool({ factory, validateTimeout: 100, destroyTimeout: 100, backoffMaxValue: 0, validate: 'ALWAYS_VALIDATE' });
        const eventLog = new EventLog(pool);

        await pool.acquire();
        await scheduler.wait(500);

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 1, reinstating: 0, doomed: 0, timedout: 0, zombie: 1, size: 2 });
        eq(eventLog.events, [
          XPoolEvents.POOL_STARTED,
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_VALIDATION_TIMEOUT,
          XPoolEvents.RESOURCE_SEGREGATED,
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_VALIDATED,
          XPoolEvents.RESOURCE_ACQUIRED,
          XPoolEvents.RESOURCE_VALIDATED,
          XPoolEvents.RESOURCE_DESTRUCTION_TIMEOUT,
          XPoolEvents.RESOURCE_SEGREGATED,
          XPoolEvents.RESOURCE_DESTRUCTION_ERROR,
        ]);
      });
    });

    describe('acquire timeout', () => {

      it('should reject if the acquire times out during resource creation', async () => {
        const factory = new TestFactory([{ resource: 1, createDelay: 200 }]);
        const pool = new XPool({ factory, acquireTimeout: 100 });

        await rejects(() => pool.acquire(), (error) => {
          eq(error.message, 'Failed to acquire resource within 100ms');
          return true;
        });
      });

      it('should reject if the acquire times out during resource validation', async () => {
        const factory = new TestFactory([{ resource: 1, validateDelay: 200 }]);
        const pool = new XPool({ factory, acquireTimeout: 100, validate: 'ALWAYS_VALIDATE' });

        await rejects(() => pool.acquire(), (error) => {
          eq(error.message, 'Failed to acquire resource within 100ms');
          return true;
        });
      });

      it('should segregate then destroy resources created belatedly after the acquire times out', async () => {
        const factory = new TestFactory([{ resource: 1, createDelay: 200 }]);
        const pool = new XPool({ factory, acquireTimeout: 100 });
        const eventLog = new EventLog(pool);

        await rejects(() => pool.acquire(), (error) => {
          eq(error.message, 'Failed to acquire resource within 100ms');
          return true;
        });
        await scheduler.wait(300);

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 0, reinstating: 0, doomed: 0, timedout: 0, zombie: 0, size: 0 });
        eq(eventLog.events, [
          XPoolEvents.POOL_STARTED,
          XPoolEvents.RESOURCE_SEGREGATED,
          XPoolEvents.RESOURCE_CREATION_ABANDONED,
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_DESTROYED,
        ]);
      });

      it('should segregate then destroy resources validated belatedly after the acquire times out', async () => {
        const factory = new TestFactory([{ resource: 1, validateDelay: 200 }]);
        const pool = new XPool({ factory, acquireTimeout: 100, validate: 'ALWAYS_VALIDATE' });
        const eventLog = new EventLog(pool);

        await rejects(() => pool.acquire(), (error) => {
          eq(error.message, 'Failed to acquire resource within 100ms');
          return true;
        });
        await scheduler.wait(300);

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 0, reinstating: 0, doomed: 0, timedout: 0, zombie: 0, size: 0 });
        eq(eventLog.events, [
          XPoolEvents.POOL_STARTED,
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_SEGREGATED,
          XPoolEvents.RESOURCE_VALIDATION_ABANDONED,
          XPoolEvents.RESOURCE_VALIDATED,
          XPoolEvents.RESOURCE_DESTROYED,
        ]);
      });

      it('should remove queued requests if acquire times out', async () => {
        const factory = new TestFactory([{ resource: 1 }]);
        const pool = new XPool({ factory, maxPoolSize: 1, acquireTimeout: 100 });

        // Block the queue by acquiring the only resource
        await pool.acquire();

        await rejects(() => pool.acquire(), (error) => {
          eq(error.message, 'Failed to acquire resource within 100ms');
          return true;
        });

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 1, reinstating: 0, doomed: 0, timedout: 0, zombie: 0, size: 1 });
      });

      it('should check for other queued requests after the acquire times out', async () => {
        const factory = new TestFactory([{ resource: 1, createDelay: 600 }, { resource: 2, createDelay: 100 }]);
        const pool = new XPool({ factory, maxPoolSize: 1, acquireTimeout: 500 });
        const eventLog = new EventLog(pool);

        // T+0ms first acquire is queued
        // T+300ms second acquire is queued
        // T+500ms first acquire times out & aborts, second acquire is dispatched
        // T+600ms second acquire is fulfilled

        pool.acquire().catch(() => {});
        await scheduler.wait(300);
        await pool.acquire();

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 1, reinstating: 0, doomed: 0, timedout: 0, zombie: 0, size: 1 });
        eq(eventLog.events, [
          XPoolEvents.POOL_STARTED,
          XPoolEvents.RESOURCE_SEGREGATED,
          XPoolEvents.RESOURCE_CREATION_ABANDONED,
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_DESTROYED,
          XPoolEvents.RESOURCE_CREATED,
          XPoolEvents.RESOURCE_ACQUIRED,
        ]);
      });
    });
  });

  describe('release', () => {

    it('should release resources returned to the pool', async () => {
      const factory = new TestFactory([{ resource: 1 }]);
      const pool = new XPool({ factory });
      const eventLog = new EventLog(pool);

      const resource = await pool.acquire();

      await pool.release(resource);

      eq(pool.stats(), { queued: 0, initialising: 0, idle: 1, acquired: 0, reinstating: 0, doomed: 0, timedout: 0, zombie: 0, size: 1 });
      eq(eventLog.events, [
        XPoolEvents.POOL_STARTED,
        XPoolEvents.RESOURCE_CREATED,
        XPoolEvents.RESOURCE_ACQUIRED,
        XPoolEvents.RESOURCE_RELEASED,
      ]);
    });

    it('should reject attempts to release an unmanaged resource when the pool has not been started', async () => {
      const factory = new TestFactory();
      const pool = new XPool({ factory });

      await rejects(() => pool.release(1), (error) => {
        eq(error.message, 'The pool has not been started');
        return true;
      });
    });

    it('should tolerate attempts to release an unmanaged resource when the pool has been started', async () => {
      const factory = new TestFactory();
      const pool = new XPool({ factory });
      const eventLog = new EventLog(pool);

      await pool.start();
      await pool.release(1);

      eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 0, reinstating: 0, doomed: 0, timedout: 0, zombie: 0, size: 0 });
      eq(eventLog.events, [
        XPoolEvents.POOL_STARTED,
      ]);
    });

    it('should not reset resources before returning them to the pool when configured', async () => {
      const factory = new TestFactory([{ resource: 1 }]);
      const pool = new XPool({ factory, reset: 'NEVER_RESET' });
      const eventLog = new EventLog(pool);

      const resource = await pool.acquire();

      await pool.release(resource);

      eq(pool.stats(), { queued: 0, initialising: 0, idle: 1, acquired: 0, reinstating: 0, doomed: 0, timedout: 0, zombie: 0, size: 1 });
      eq(eventLog.events, [
        XPoolEvents.POOL_STARTED,
        XPoolEvents.RESOURCE_CREATED,
        XPoolEvents.RESOURCE_ACQUIRED,
        XPoolEvents.RESOURCE_RELEASED,
      ]);
    });

    it('should reset resources before returning them to the pool when configured', async () => {
      const factory = new TestFactory([{ resource: 1 }]);
      const pool = new XPool({ factory, reset: 'ALWAYS_RESET' });
      const eventLog = new EventLog(pool);

      const resource = await pool.acquire();

      await pool.release(resource);

      eq(pool.stats(), { queued: 0, initialising: 0, idle: 1, acquired: 0, reinstating: 0, doomed: 0, timedout: 0, zombie: 0, size: 1 });
      eq(eventLog.events, [
        XPoolEvents.POOL_STARTED,
        XPoolEvents.RESOURCE_CREATED,
        XPoolEvents.RESOURCE_ACQUIRED,
        XPoolEvents.RESOURCE_RESET,
        XPoolEvents.RESOURCE_RELEASED,
      ]);
    });

    it('should destroy resources that error while being reset', async () => {
      const factory = new TestFactory([{ resource: 1, resetError: 'Oh Noes' }]);
      const pool = new XPool({ factory, reset: 'ALWAYS_RESET' });
      const eventLog = new EventLog(pool);

      const resource = await pool.acquire();

      await pool.release(resource);

      eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 0, reinstating: 0, doomed: 0, timedout: 0, zombie: 0, size: 0 });
      eq(eventLog.events, [
        XPoolEvents.POOL_STARTED,
        XPoolEvents.RESOURCE_CREATED,
        XPoolEvents.RESOURCE_ACQUIRED,
        XPoolEvents.RESOURCE_RESET_ERROR,
        XPoolEvents.RESOURCE_DESTROYED,
      ]);
    });

    it('should segregate then destroy resources that timeout, then error while being reset', async () => {
      const factory = new TestFactory([{ resource: 1, resetDelay: 200, resetError: 'Oh Noes' }]);
      const pool = new XPool({ factory, reset: 'ALWAYS_RESET', resetTimeout: 100 });
      const eventLog = new EventLog(pool);

      const resource = await pool.acquire();

      await pool.release(resource);
      await scheduler.wait(300);

      eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 0, reinstating: 0, doomed: 0, timedout: 0, zombie: 0, size: 0 });
      eq(eventLog.events, [
        XPoolEvents.POOL_STARTED,
        XPoolEvents.RESOURCE_CREATED,
        XPoolEvents.RESOURCE_ACQUIRED,
        XPoolEvents.RESOURCE_RESET_TIMEOUT,
        XPoolEvents.RESOURCE_SEGREGATED,
        XPoolEvents.RESOURCE_RESET_ERROR,
        XPoolEvents.RESOURCE_DESTROYED,
      ]);
      await scheduler.wait(1000);
    });

    it('should segregate then destroy resources that timeout, then reset belatedly', async () => {
      const factory = new TestFactory([{ resource: 1, resetDelay: 200 }]);
      const pool = new XPool({ factory, reset: 'ALWAYS_RESET', resetTimeout: 100 });
      const eventLog = new EventLog(pool);

      const resource = await pool.acquire();

      await pool.release(resource);
      await scheduler.wait(300);

      eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 0, reinstating: 0, doomed: 0, timedout: 0, zombie: 0, size: 0 });
      eq(eventLog.events, [
        XPoolEvents.POOL_STARTED,
        XPoolEvents.RESOURCE_CREATED,
        XPoolEvents.RESOURCE_ACQUIRED,
        XPoolEvents.RESOURCE_RESET_TIMEOUT,
        XPoolEvents.RESOURCE_SEGREGATED,
        XPoolEvents.RESOURCE_RESET,
        XPoolEvents.RESOURCE_DESTROYED,
      ]);
    });

    it('should segregate then destroy resources that timeout, then reset belatedly, but timeout while being destroyed', async () => {
      const factory = new TestFactory([{ resource: 1, resetDelay: 200, destroyDelay: 200 }]);
      const pool = new XPool({ factory, reset: 'ALWAYS_RESET', resetTimeout: 100, destroyTimeout: 100 });
      const eventLog = new EventLog(pool);

      const resource = await pool.acquire();

      await pool.release(resource);
      await scheduler.wait(500);

      eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 0, reinstating: 0, doomed: 0, timedout: 0, zombie: 0, size: 0 });
      eq(eventLog.events, [
        XPoolEvents.POOL_STARTED,
        XPoolEvents.RESOURCE_CREATED,
        XPoolEvents.RESOURCE_ACQUIRED,
        XPoolEvents.RESOURCE_RESET_TIMEOUT,
        XPoolEvents.RESOURCE_SEGREGATED,
        XPoolEvents.RESOURCE_RESET,
        XPoolEvents.RESOURCE_DESTRUCTION_TIMEOUT,
        XPoolEvents.RESOURCE_SEGREGATED,
        XPoolEvents.RESOURCE_DESTROYED,
      ]);
    });

    it('should zombie resources that timeout, then reset belatedly, but error when being destroyed', async () => {
      const factory = new TestFactory([{ resource: 1, resetDelay: 200, destroyError: 'Oh Noes!' }]);
      const pool = new XPool({ factory, reset: 'ALWAYS_RESET', resetTimeout: 100 });
      const eventLog = new EventLog(pool);

      const resource = await pool.acquire();

      await pool.release(resource);
      await scheduler.wait(300);

      eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 0, reinstating: 0, doomed: 0, timedout: 0, zombie: 1, size: 1 });
      eq(eventLog.events, [
        XPoolEvents.POOL_STARTED,
        XPoolEvents.RESOURCE_CREATED,
        XPoolEvents.RESOURCE_ACQUIRED,
        XPoolEvents.RESOURCE_RESET_TIMEOUT,
        XPoolEvents.RESOURCE_SEGREGATED,
        XPoolEvents.RESOURCE_RESET,
        XPoolEvents.RESOURCE_DESTRUCTION_ERROR,
      ]);
    });

    it('should zombie resources that timeout, then reset belatedly, but timeout, then error when being destroyed', async () => {
      const factory = new TestFactory([{ resource: 1, resetDelay: 200, destroyDelay: 200, destroyError: 'Oh Noes!' }]);
      const pool = new XPool({ factory, reset: 'ALWAYS_RESET', resetTimeout: 100, destroyTimeout: 100 });
      const eventLog = new EventLog(pool);

      const resource = await pool.acquire();

      await pool.release(resource);
      await scheduler.wait(500);

      eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 0, reinstating: 0, doomed: 0, timedout: 0, zombie: 1, size: 1 });
      eq(eventLog.events, [
        XPoolEvents.POOL_STARTED,
        XPoolEvents.RESOURCE_CREATED,
        XPoolEvents.RESOURCE_ACQUIRED,
        XPoolEvents.RESOURCE_RESET_TIMEOUT,
        XPoolEvents.RESOURCE_SEGREGATED,
        XPoolEvents.RESOURCE_RESET,
        XPoolEvents.RESOURCE_DESTRUCTION_TIMEOUT,
        XPoolEvents.RESOURCE_SEGREGATED,
        XPoolEvents.RESOURCE_DESTRUCTION_ERROR,
      ]);
    });
  });

  describe('destroy', () => {

    it('should destroy resources returned to the pool', async () => {
      const factory = new TestFactory([{ resource: 1 }]);
      const pool = new XPool({ factory });
      const eventLog = new EventLog(pool);

      const resource = await pool.acquire();

      await pool.destroy(resource);

      eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 0, reinstating: 0, doomed: 0, timedout: 0, zombie: 0, size: 0 });
      eq(eventLog.events, [
        XPoolEvents.POOL_STARTED,
        XPoolEvents.RESOURCE_CREATED,
        XPoolEvents.RESOURCE_ACQUIRED,
        XPoolEvents.RESOURCE_DESTROYED,
      ]);
    });

    it('should zombie resources that error while being destroyed', async () => {
      const factory = new TestFactory([{ resource: 1, destroyError: 'Oh Noes!' }]);
      const pool = new XPool({ factory });
      const eventLog = new EventLog(pool);

      const resource = await pool.acquire();

      await pool.destroy(resource);

      eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 0, reinstating: 0, doomed: 0, timedout: 0, zombie: 1, size: 1 });
      eq(eventLog.events, [
        XPoolEvents.POOL_STARTED,
        XPoolEvents.RESOURCE_CREATED,
        XPoolEvents.RESOURCE_ACQUIRED,
        XPoolEvents.RESOURCE_DESTRUCTION_ERROR,
      ]);
    });

    it('should segregate then destroy resources that time out while being destroyed', async () => {
      const factory = new TestFactory([{ resource: 1, destroyDelay: 200 }]);
      const pool = new XPool({ factory, destroyTimeout: 100 });
      const eventLog = new EventLog(pool);

      const resource = await pool.acquire();

      await pool.destroy(resource);

      await scheduler.wait(300);

      eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 0, reinstating: 0, doomed: 0, timedout: 0, zombie: 0, size: 0 });
      eq(eventLog.events, [
        XPoolEvents.POOL_STARTED,
        XPoolEvents.RESOURCE_CREATED,
        XPoolEvents.RESOURCE_ACQUIRED,
        XPoolEvents.RESOURCE_DESTRUCTION_TIMEOUT,
        XPoolEvents.RESOURCE_SEGREGATED,
        XPoolEvents.RESOURCE_DESTROYED,
      ]);
    });

    it('should zombie resources created belatedly that error while being destroyed', async () => {
      const factory = new TestFactory([{ resource: 1, destroyDelay: 200, destroyError: 'Oh Noes!' }]);
      const pool = new XPool({ factory, destroyTimeout: 100 });
      const eventLog = new EventLog(pool);

      const resource = await pool.acquire();

      await pool.destroy(resource);

      await scheduler.wait(300);

      eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 0, reinstating: 0, doomed: 0, timedout: 0, zombie: 1, size: 1 });
      eq(eventLog.events, [
        XPoolEvents.POOL_STARTED,
        XPoolEvents.RESOURCE_CREATED,
        XPoolEvents.RESOURCE_ACQUIRED,
        XPoolEvents.RESOURCE_DESTRUCTION_TIMEOUT,
        XPoolEvents.RESOURCE_SEGREGATED,
        XPoolEvents.RESOURCE_DESTRUCTION_ERROR,
      ]);
    });

    it('should reject attempts to destroy an unmanaged resource when the pool has not been started', async () => {
      const factory = new TestFactory();
      const pool = new XPool({ factory });

      await rejects(() => pool.destroy(1), (error) => {
        eq(error.message, 'The pool has not been started');
        return true;
      });
    });

    it('should tolerate attempts to destroy an unmanaged resource when the pool has been started', async () => {
      const factory = new TestFactory();
      const pool = new XPool({ factory });
      const eventLog = new EventLog(pool);

      await pool.start();
      await pool.destroy(1);

      eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 0, reinstating: 0, doomed: 0, timedout: 0, zombie: 0, size: 0 });
      eq(eventLog.events, [
        XPoolEvents.POOL_STARTED,
      ]);
    });

    it('should maintain the minimum pool size', async () => {
      const factory = new TestFactory([{ resource: 1 }, { resource: 2 }]);
      const pool = new XPool({ factory, minPoolSize: 1 });
      const eventLog = new EventLog(pool);

      await pool.start();
      const resource = await pool.acquire();
      await pool.destroy(resource);

      await scheduler.wait(100);

      eq(pool.stats(), { queued: 0, initialising: 0, idle: 1, acquired: 0, reinstating: 0, doomed: 0, timedout: 0, zombie: 0, size: 1 });
      eq(eventLog.events, [
        XPoolEvents.RESOURCE_CREATED,
        XPoolEvents.RESOURCE_RELEASED,
        XPoolEvents.POOL_STARTED,
        XPoolEvents.RESOURCE_ACQUIRED,
        XPoolEvents.RESOURCE_DESTROYED,
        XPoolEvents.RESOURCE_CREATED,
        XPoolEvents.RESOURCE_RELEASED,
      ]);
    });

    it('should maintain the minimum pool size even with concurrent destroys', async () => {
      const factory = new TestFactory([{ resource: 1, destroyDelay: 100 }, { resource: 2, destroyDelay: 100 }, { resource: 3, destroyDelay: 100 }, { resource: 4 }, { resource: 5 }, { resource: 6 }]);
      const pool = new XPool({ factory, minPoolSize: 3 });

      await pool.start();

      PromiseUtils.times(3, async () => {
        const resource = await pool.acquire();
        pool.destroy(resource);
      });

      await scheduler.wait(500);

      eq(pool.stats(), { queued: 0, initialising: 0, idle: 3, acquired: 0, reinstating: 0, doomed: 0, timedout: 0, zombie: 0, size: 3 });
    });

    it('should tolerate errors refilling the pool', async () => {
      const factory = new TestFactory([{ resource: 1 }, { resource: 2, createError: 'Oh Noes!' }, { resource: 3 }]);
      const pool = new XPool({ factory, minPoolSize: 1 });
      const eventLog = new EventLog(pool);

      await pool.start();
      const resource = await pool.acquire();
      await pool.destroy(resource);

      await scheduler.wait(300);

      eq(pool.stats(), { queued: 0, initialising: 0, idle: 1, acquired: 0, reinstating: 0, doomed: 0, timedout: 0, zombie: 0, size: 1 });
      eq(eventLog.events, [
        XPoolEvents.RESOURCE_CREATED,
        XPoolEvents.RESOURCE_RELEASED,
        XPoolEvents.POOL_STARTED,
        XPoolEvents.RESOURCE_ACQUIRED,
        XPoolEvents.RESOURCE_DESTROYED,
        XPoolEvents.RESOURCE_CREATION_ERROR,
        XPoolEvents.RESOURCE_CREATED,
        XPoolEvents.RESOURCE_RELEASED,
      ]);
    });
  });

  describe('with', () => {
    it('should acquire and release resources', async () => {
      const factory = new TestFactory([{ resource: 1 }]);
      const pool = new XPool({ factory });
      const eventLog = new EventLog(pool);

      await pool.start();
      await pool.with((resource) => {
        eq(resource, 1);
      });

      eq(pool.stats(), { queued: 0, initialising: 0, idle: 1, acquired: 0, reinstating: 0, doomed: 0, timedout: 0, zombie: 0, size: 1 });
      eq(eventLog.events, [
        XPoolEvents.POOL_STARTED,
        XPoolEvents.RESOURCE_CREATED,
        XPoolEvents.RESOURCE_ACQUIRED,
        XPoolEvents.RESOURCE_RELEASED,
      ]);
    });

    it('should yield synchronous function result', async () => {
      const factory = new TestFactory([{ resource: 1 }]);
      const pool = new XPool({ factory, minPoolSize: 1 });

      await pool.start();
      const result = await pool.with(() => 'ok');

      eq(result, 'ok');
    });

    it('should yield asynchronous function result', async () => {
      const factory = new TestFactory([{ resource: 1 }]);
      const pool = new XPool({ factory, minPoolSize: 1 });

      await pool.start();
      const result = await pool.with(async () => Promise.resolve('ok'));

      eq(result, 'ok');
    });

    it('should reject errors thrown by the function', async () => {
      const factory = new TestFactory([{ resource: 1 }]);
      const pool = new XPool({ factory, minPoolSize: 1 });

      await pool.start();
      await rejects(() => pool.with(async () => {
        throw new Error('Oh Noes!');
      }), (error) => {
        eq(error.message, 'Oh Noes!');
        return true;
      });
    });

    it('should timeout', async () => {
      const factory = new TestFactory([{ resource: 1, createDelay: 200 }]);
      const pool = new XPool({ factory, acquireTimeout: 100 });

      await pool.start();
      await rejects(() => pool.with(async () => {
        fail('Should have timed out');
      }), (error) => {
        eq(error.message, 'Failed to acquire resource within 100ms');
        return true;
      });
    });
  });

  describe('stats', () => {

    it('should provide empty statistics', () => {
      const pool = new XPool();
      eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 0, reinstating: 0, doomed: 0, timedout: 0, zombie: 0, size: 0 });
    });
  });
});
