const { describe, it, afterEach } = require('zunit');
const { deepStrictEqual: eq, rejects, fail } = require('node:assert');
const { scheduler } = require('node:timers/promises');
const { Pool, Events } = require('..');
const PromiseUtils = require('../lib/utils/PromiseUtils');
const TestFactory = require('./lib/TestFactory');
const EventLog = require('./lib/EventLog');
const { takesAtLeast: tmin } = require('./lib/custom-assertions');

describe('Pool', () => {

  describe('configuration', () => {
    it('validates min and max pool size');
  });

  describe('events', () => {
    it('should report errors thrown in custom resource handlers', async (t, done) => {
      const factory = new TestFactory([{ resource: 1 }]);
      const pool = new Pool({ factory, minPoolSize: 1 });

      pool.on(Events.RESOURCE_CREATED, () => {
        throw new Error('Oh Noes!');
      });

      pool.on('error', ({ error }) => {
        eq(error.message, 'Custom event handlers must not throw errors');
        eq(error.cause.message, 'Oh Noes!');
        done();
      });

      await pool.start();
    });
  });

  describe('start', () => {

    it('should reject if the pool has already been started', async () => {
      const factory = new TestFactory();
      const pool = new Pool({ factory });
      await pool.start();

      await rejects(() => pool.start(), (error) => {
        eq(error.message, 'The pool has already been started');
        return true;
      });
    });

    it('should reject if the pool has already been stopped', async () => {
      const factory = new TestFactory();
      const pool = new Pool({ factory });

      await pool.stop();

      await rejects(() => pool.start(), (error) => {
        eq(error.message, 'The pool has already been stopped');
        return true;
      });
    });

    it('should default to no minimum pool size', async () => {
      const factory = new TestFactory([{ resource: 1 }, { resource: 2 }, { resource: 3 }]);
      const pool = new Pool({ factory });
      const eventLog = new EventLog(pool);

      await pool.start();

      eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 0, doomed: 0, segregated: 0, size: 0 });
      eq(eventLog.events, []);
    });

    describe('resource creation', () => {

      it('should create the specified minimum number of resources', async () => {
        const factory = new TestFactory([{ resource: 1 }, { resource: 2 }, { resource: 3 }]);
        const pool = new Pool({ factory, minPoolSize: 2 });

        await pool.start();

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 2, acquired: 0, doomed: 0, segregated: 0, size: 2 });
      });

      it('should create the specified minimum number of idle resources', async () => {
        const factory = new TestFactory([{ resource: 1 }, { resource: 2 }]);
        const pool = new Pool({ factory, minIdleResources: 2 });

        await pool.start();

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 2, acquired: 0, doomed: 0, segregated: 0, size: 2 });
      });

      it('should not exceed the default max concurrency', async () => {
        const factory = new TestFactory(Array.from({ length: 6 }, (_, index) => ({ resource: index, createDelay: 200 })));
        const pool = new Pool({ factory, minPoolSize: 6 });

        await tmin(() => pool.start(), 400);

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 6, acquired: 0, doomed: 0, segregated: 0, size: 6 });
      });

      it('should not exceed the specified max concurrency', async () => {
        const factory = new TestFactory(Array.from({ length: 6 }, (_, index) => ({ resource: index, createDelay: 200 })));
        const pool = new Pool({ factory, minPoolSize: 6, maxConcurrency: 2 });

        await tmin(() => pool.start(), 600);

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 6, acquired: 0, doomed: 0, segregated: 0, size: 6 });
      });

      it('should retry on resource creation errors', async () => {
        const factory = new TestFactory([{ resource: 1, createError: 'Oh Noes!' }, { resource: 2 }]);
        const pool = new Pool({ factory, minPoolSize: 1 });
        const eventLog = new EventLog(pool);

        await pool.start();

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 1, acquired: 0, doomed: 0, segregated: 0, size: 1 });
        eq(eventLog.events, [
          Events.RESOURCE_CREATION_ERROR,
          Events.RESOURCE_CREATED,
          Events.RESOURCE_RELEASED,
        ]);
      });

      it('should backoff exponentially after an error creating resources', async () => {
        const factory = new TestFactory([{ createError: 'Oh Noes!' }, { createError: 'Oh Noes!' }, { createError: 'Oh Noes!' }, { resource: 4 }]);
        const pool = new Pool({ factory, minPoolSize: 1 });
        const eventLog = new EventLog(pool);

        await tmin(async () => {
          await pool.start();
        }, 100 + 200 + 400);

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 1, acquired: 0, doomed: 0, segregated: 0, size: 1 });
        eq(eventLog.events, [
          Events.RESOURCE_CREATION_ERROR,
          Events.RESOURCE_CREATION_ERROR,
          Events.RESOURCE_CREATION_ERROR,
          Events.RESOURCE_CREATED,
          Events.RESOURCE_RELEASED,
        ]);
      });

      it('should honour backoff configuration', async () => {
        const factory = new TestFactory([{ createError: 'Oh Noes!' }, { createError: 'Oh Noes!' }, { createError: 'Oh Noes!' }, { resource: 4 }]);
        const pool = new Pool({ factory, minPoolSize: 1, backoffInitialValue: 50, backoffFactor: 1.5, backoffMaxValue: 100 });
        const eventLog = new EventLog(pool);

        await tmin(async () => {
          await pool.start();
        }, 50 + 75 + 100);

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 1, acquired: 0, doomed: 0, segregated: 0, size: 1 });
        eq(eventLog.events, [
          Events.RESOURCE_CREATION_ERROR,
          Events.RESOURCE_CREATION_ERROR,
          Events.RESOURCE_CREATION_ERROR,
          Events.RESOURCE_CREATED,
          Events.RESOURCE_RELEASED,
        ]);
      });

      it('should segregate then destroy resources created belatedly', async () => {
        const factory = new TestFactory([{ resource: 1 }, { createDelay: 200 }, { resource: 3 }]);
        const pool = new Pool({ factory, minPoolSize: 2, createTimeout: 100, backoffMaxValue: 0 });
        const eventLog = new EventLog(pool);

        await pool.start();
        await scheduler.wait(300);

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 2, acquired: 0, doomed: 0, segregated: 0, size: 2 });
        eq(eventLog.events, [
          Events.RESOURCE_CREATED,
          Events.RESOURCE_RELEASED,
          Events.RESOURCE_CREATION_TIMEOUT,
          Events.RESOURCE_SEGREGATED,
          Events.RESOURCE_CREATED,
          Events.RESOURCE_RELEASED,
          Events.RESOURCE_CREATED,
          Events.RESOURCE_DESTROYED,
        ]);
      });

      it('should segregate then destroy resources created belatedly that timeout while being destroyed', async () => {
        const factory = new TestFactory([{ resource: 1, createDelay: 200, destroyDelay: 200 }, { resource: 2 }]);
        const pool = new Pool({ factory, minPoolSize: 1, createTimeout: 100, destroyTimeout: 100 });
        const eventLog = new EventLog(pool);

        await pool.start();
        await scheduler.wait(500);

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 1, acquired: 0, doomed: 0, segregated: 0, size: 1 });
        eq(eventLog.events, [
          Events.RESOURCE_CREATION_TIMEOUT,
          Events.RESOURCE_SEGREGATED,
          Events.RESOURCE_CREATED,
          Events.RESOURCE_CREATED,
          Events.RESOURCE_RELEASED,
          Events.RESOURCE_DESTRUCTION_TIMEOUT,
          Events.RESOURCE_SEGREGATED,
          Events.RESOURCE_DESTROYED,
        ]);
      });

      it('should permanently segregate resources created belatedly that error while being destroyed', async () => {
        const factory = new TestFactory([{ resource: 1, createDelay: 200, destroyError: 'Oh Noes!' }, { resource: 2 }]);
        const pool = new Pool({ factory, minPoolSize: 1, createTimeout: 100, backoffMaxValue: 0 });
        const eventLog = new EventLog(pool);

        await pool.start();
        await scheduler.wait(300);

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 1, acquired: 0, doomed: 0, segregated: 1, size: 2 });
        eq(eventLog.events, [
          Events.RESOURCE_CREATION_TIMEOUT,
          Events.RESOURCE_SEGREGATED,
          Events.RESOURCE_CREATED,
          Events.RESOURCE_RELEASED,
          Events.RESOURCE_CREATED,
          Events.RESOURCE_DESTRUCTION_ERROR,
          Events.RESOURCE_SEGREGATED,
        ]);
      });

      it('should permanently segregate resources created belatedly that timeout then error while being destroyed', async () => {
        const factory = new TestFactory([{ resource: 1, createDelay: 200, destroyDelay: 200, destroyError: 'Oh Noes!' }, { resource: 2 }]);
        const pool = new Pool({ factory, minPoolSize: 1, createTimeout: 100, destroyTimeout: 100, backoffMaxValue: 0 });
        const eventLog = new EventLog(pool);

        await pool.start();
        await scheduler.wait(500);

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 1, acquired: 0, doomed: 0, segregated: 1, size: 2 });
        eq(eventLog.events, [
          Events.RESOURCE_CREATION_TIMEOUT,
          Events.RESOURCE_SEGREGATED,
          Events.RESOURCE_CREATED,
          Events.RESOURCE_RELEASED,
          Events.RESOURCE_CREATED,
          Events.RESOURCE_DESTRUCTION_TIMEOUT,
          Events.RESOURCE_SEGREGATED,
          Events.RESOURCE_DESTRUCTION_ERROR,
        ]);
      });
    });

    describe('resource validation', () => {

      it('should validate created resources when configuration specifies ALWAYS', async () => {
        const factory = new TestFactory([{ resource: 1 }]);
        const pool = new Pool({ factory, minPoolSize: 1, validate: 'ALWAYS' });
        const eventLog = new EventLog(pool);

        await pool.start();
        eq(pool.stats(), { queued: 0, initialising: 0, idle: 1, acquired: 0, doomed: 0, segregated: 0, size: 1 });
        eq(eventLog.events, [
          Events.RESOURCE_CREATED,
          Events.RESOURCE_VALIDATED,
          Events.RESOURCE_RELEASED,
        ]);
      });

      it('should validate created resources when configuration specifies CREATE', async () => {
        const factory = new TestFactory([{ resource: 1 }]);
        const pool = new Pool({ factory, minPoolSize: 1, validate: 'CREATE' });
        const eventLog = new EventLog(pool);

        await pool.start();
        eq(eventLog.events, [
          Events.RESOURCE_CREATED,
          Events.RESOURCE_VALIDATED,
          Events.RESOURCE_RELEASED,
        ]);

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 1, acquired: 0, doomed: 0, segregated: 0, size: 1 });
      });

      it('should not validate created resources when configuration specifies IDLE', async () => {
        const factory = new TestFactory([{ resource: 1 }]);
        const pool = new Pool({ factory, minPoolSize: 1, validate: 'IDLE' });
        const eventLog = new EventLog(pool);

        await pool.start();

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 1, acquired: 0, doomed: 0, segregated: 0, size: 1 });
        eq(eventLog.events, [
          Events.RESOURCE_CREATED,
          Events.RESOURCE_RELEASED,
        ]);
      });

      it('should not validate created resource when configuration specifies NEVER', async () => {
        const factory = new TestFactory([{ resource: 1 }]);
        const pool = new Pool({ factory, minPoolSize: 1, validate: 'NEVER' });
        const eventLog = new EventLog(pool);

        await pool.start();

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 1, acquired: 0, doomed: 0, segregated: 0, size: 1 });
        eq(eventLog.events, [
          Events.RESOURCE_CREATED,
          Events.RESOURCE_RELEASED,
        ]);
      });

      it('should handle errors validating resources', async () => {
        const factory = new TestFactory([{ resource: 1, validateError: 'Oh Noes!' }, { resource: 2 }]);
        const pool = new Pool({ factory, minPoolSize: 1, validate: 'ALWAYS' });
        const eventLog = new EventLog(pool);

        await pool.start();

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 1, acquired: 0, doomed: 0, segregated: 0, size: 1 });
        eq(eventLog.events, [
          Events.RESOURCE_CREATED,
          Events.RESOURCE_VALIDATION_ERROR,
          Events.RESOURCE_SEGREGATED,
          Events.RESOURCE_DESTROYED,
          Events.RESOURCE_CREATED,
          Events.RESOURCE_VALIDATED,
          Events.RESOURCE_RELEASED,
        ]);
      });

      it('should backoff exponentially after an error validating resources', async () => {
        const factory = new TestFactory([{ validateError: 'Oh Noes!' }, { validateError: 'Oh Noes!' }, { validateError: 'Oh Noes!' }, { resource: 4 }]);
        const pool = new Pool({ factory, minPoolSize: 1, validate: 'ALWAYS' });
        const eventLog = new EventLog(pool);

        await tmin(async () => {
          await pool.start();
        }, 100 + 200 + 400);

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 1, acquired: 0, doomed: 0, segregated: 0, size: 1 });
        eq(eventLog.events, [
          Events.RESOURCE_CREATED,
          Events.RESOURCE_VALIDATION_ERROR,
          Events.RESOURCE_SEGREGATED,
          Events.RESOURCE_DESTROYED,
          Events.RESOURCE_CREATED,
          Events.RESOURCE_VALIDATION_ERROR,
          Events.RESOURCE_SEGREGATED,
          Events.RESOURCE_DESTROYED,
          Events.RESOURCE_CREATED,
          Events.RESOURCE_VALIDATION_ERROR,
          Events.RESOURCE_SEGREGATED,
          Events.RESOURCE_DESTROYED,
          Events.RESOURCE_CREATED,
          Events.RESOURCE_VALIDATED,
          Events.RESOURCE_RELEASED,
        ]);
      });

      it('should honour backoff configuration', async () => {
        const factory = new TestFactory([{ validateError: 'Oh Noes!' }, { validateError: 'Oh Noes!' }, { validateError: 'Oh Noes!' }, { resource: 4 }]);
        const pool = new Pool({ factory, minPoolSize: 1, backoffInitialValue: 50, backoffFactor: 1.5, backoffMaxValue: 100, validate: 'ALWAYS' });
        const eventLog = new EventLog(pool);

        await tmin(async () => {
          await pool.start();
        }, 50 + 75 + 100);

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 1, acquired: 0, doomed: 0, segregated: 0, size: 1 });
        eq(eventLog.events, [
          Events.RESOURCE_CREATED,
          Events.RESOURCE_VALIDATION_ERROR,
          Events.RESOURCE_SEGREGATED,
          Events.RESOURCE_DESTROYED,
          Events.RESOURCE_CREATED,
          Events.RESOURCE_VALIDATION_ERROR,
          Events.RESOURCE_SEGREGATED,
          Events.RESOURCE_DESTROYED,
          Events.RESOURCE_CREATED,
          Events.RESOURCE_VALIDATION_ERROR,
          Events.RESOURCE_SEGREGATED,
          Events.RESOURCE_DESTROYED,
          Events.RESOURCE_CREATED,
          Events.RESOURCE_VALIDATED,
          Events.RESOURCE_RELEASED,
        ]);
      });

      it('should segregate then destroy resources validated belatedly that timeout while being destroyed', async () => {
        const factory = new TestFactory([{ resource: 1, validateDelay: 200, destroyDelay: 200 }, { resource: 2 }]);
        const pool = new Pool({ factory, minPoolSize: 1, validateTimeout: 100, destroyTimeout: 100, backoffMaxValue: 0, validate: 'ALWAYS' });
        const eventLog = new EventLog(pool);

        await pool.start();
        await scheduler.wait(500);

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 1, acquired: 0, doomed: 0, segregated: 0, size: 1 });
        eq(eventLog.events, [
          Events.RESOURCE_CREATED,
          Events.RESOURCE_VALIDATION_TIMEOUT,
          Events.RESOURCE_SEGREGATED,
          Events.RESOURCE_CREATED,
          Events.RESOURCE_VALIDATED,
          Events.RESOURCE_RELEASED,
          Events.RESOURCE_VALIDATED,
          Events.RESOURCE_DESTRUCTION_TIMEOUT,
          Events.RESOURCE_SEGREGATED,
          Events.RESOURCE_DESTROYED,
        ]);
      });

      it('should permanently segregate resources validated belatedly that error while being destroyed', async () => {
        const factory = new TestFactory([{ resource: 1, validateDelay: 200, destroyError: 'Oh Noes!' }, { resource: 2 }]);
        const pool = new Pool({ factory, minPoolSize: 1, validateTimeout: 100, backoffMaxValue: 0, validate: 'ALWAYS' });
        const eventLog = new EventLog(pool);

        await pool.start();
        await scheduler.wait(300);

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 1, acquired: 0, doomed: 0, segregated: 1, size: 2 });
        eq(eventLog.events, [
          Events.RESOURCE_CREATED,
          Events.RESOURCE_VALIDATION_TIMEOUT,
          Events.RESOURCE_SEGREGATED,
          Events.RESOURCE_CREATED,
          Events.RESOURCE_VALIDATED,
          Events.RESOURCE_RELEASED,
          Events.RESOURCE_VALIDATED,
          Events.RESOURCE_DESTRUCTION_ERROR,
          Events.RESOURCE_SEGREGATED,
        ]);
      });

      it('should permanently segregate resources validated belatedly that timeout then error while being destroyed', async () => {
        const factory = new TestFactory([{ resource: 1, validateDelay: 200, destroyDelay: 200, destroyError: 'Oh Noes!' }, { resource: 2 }]);
        const pool = new Pool({ factory, minPoolSize: 1, validateTimeout: 100, destroyTimeout: 100, backoffMaxValue: 0, validate: 'ALWAYS' });
        const eventLog = new EventLog(pool);

        await pool.start();
        await scheduler.wait(500);

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 1, acquired: 0, doomed: 0, segregated: 1, size: 2 });
        eq(eventLog.events, [
          Events.RESOURCE_CREATED,
          Events.RESOURCE_VALIDATION_TIMEOUT,
          Events.RESOURCE_SEGREGATED,
          Events.RESOURCE_CREATED,
          Events.RESOURCE_VALIDATED,
          Events.RESOURCE_RELEASED,
          Events.RESOURCE_VALIDATED,
          Events.RESOURCE_DESTRUCTION_TIMEOUT,
          Events.RESOURCE_SEGREGATED,
          Events.RESOURCE_DESTRUCTION_ERROR,
        ]);
      });
    });

    describe('start timeout', () => {

      it('should reject if the start times out during resource creation', async () => {
        const factory = new TestFactory([{ resource: 1, createDelay: 200 }]);
        const pool = new Pool({ factory, minPoolSize: 1, startTimeout: 100 });

        await rejects(() => pool.start(), (error) => {
          eq(error.message, 'Failed to start pool within 100ms');
          return true;
        });
      });

      it('should segregate resources created belatedly if start times out during resource creation', async () => {
        const factory = new TestFactory([{ resource: 1, createDelay: 200 }]);
        const pool = new Pool({ factory, minPoolSize: 1, startTimeout: 100 });
        const eventLog = new EventLog(pool);

        await rejects(() => pool.start(), (error) => {
          eq(error.message, 'Failed to start pool within 100ms');
          return true;
        });

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 0, doomed: 0, segregated: 1, size: 1 });
        eq(eventLog.events, [
          Events.RESOURCE_SEGREGATED,
        ]);
      });

      it('should reject if the start times out during resource validation', async () => {
        const factory = new TestFactory([{ resource: 1, validateDelay: 200 }]);
        const pool = new Pool({ factory, minPoolSize: 1, startTimeout: 100, validate: 'ALWAYS' });

        await rejects(() => pool.start(), (error) => {
          eq(error.message, 'Failed to start pool within 100ms');
          return true;
        });
      });

      it('should segregate then destroy resources validated belatedly if start times out during resource validation', async () => {
        const factory = new TestFactory([{ resource: 1, validateDelay: 200 }]);
        const pool = new Pool({ factory, minPoolSize: 1, startTimeout: 100, validate: 'ALWAYS' });
        const eventLog = new EventLog(pool);

        await rejects(() => pool.start(), (error) => {
          eq(error.message, 'Failed to start pool within 100ms');
          return true;
        });

        await scheduler.wait(200);

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 0, doomed: 0, segregated: 0, size: 0 });
        eq(eventLog.events, [
          Events.RESOURCE_CREATED,
          Events.RESOURCE_SEGREGATED,
          Events.RESOURCE_VALIDATED,
          Events.RESOURCE_DESTROYED,
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
      const pool = new Pool({ factory, minPoolSize: 3 });

      pool.start();
      await pool.stop();

      eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 0, doomed: 0, segregated: 0, size: 0 });
    });

    it('should reject subsequent acquisition requests', async () => {
      const factory = new TestFactory([{ resource: 1 }]);
      const pool = new Pool({ factory });

      await pool.start();
      await pool.stop();

      await rejects(pool.acquire(), (error) => {
        eq(error.message, 'The pool has been stopped');
        return true;
      });

      eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 0, doomed: 0, segregated: 0, size: 0 });
    });

    it('should destroy idle resources', async () => {
      const factory = new TestFactory([{ resource: 1 }, { resource: 2 }, { resource: 3 }]);
      const pool = new Pool({ factory, minPoolSize: 3 });
      const eventLog = new EventLog(pool);

      await pool.start();
      await pool.stop();

      eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 0, doomed: 0, segregated: 0, size: 0 });
      eq(eventLog.events, [
        Events.RESOURCE_CREATED,
        Events.RESOURCE_CREATED,
        Events.RESOURCE_CREATED,
        Events.RESOURCE_RELEASED,
        Events.RESOURCE_RELEASED,
        Events.RESOURCE_RELEASED,
        Events.RESOURCE_DESTROYED,
        Events.RESOURCE_DESTROYED,
        Events.RESOURCE_DESTROYED,
      ]);
    });

    it('should not destroy segregated resources', async () => {
      const factory = new TestFactory([{ resource: 1, createDelay: 200 }]);
      const pool = new Pool({ factory, minPoolSize: 1, startTimeout: 100 });
      const eventLog = new EventLog(pool);

      await rejects(pool.start(), (error) => {
        eq(error.message, 'Failed to start pool within 100ms');
        return true;
      });

      await pool.stop();

      eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 0, doomed: 0, segregated: 1, size: 1 });
      eq(eventLog.events, [
        Events.RESOURCE_SEGREGATED,
      ]);
    });

    it('should wait for queued requests to complete before destroying idle resources', async () => {
      const factory = new TestFactory([{ resource: 1 }]);
      const pool = new Pool({ factory, minPoolSize: 1, maxPoolSize: 1 });
      const eventLog = new EventLog(pool);

      await pool.start();

      const events = [Events.RESOURCE_CREATED, Events.RESOURCE_RELEASED];
      PromiseUtils.times(11, async () => {
        events.push(Events.RESOURCE_ACQUIRED, Events.RESOURCE_RELEASED);
        const resource = await pool.acquire();
        setTimeout(() => pool.release(resource), 100);
      }).then(() => {
        events.push(Events.RESOURCE_DESTROYED);
      });

      await scheduler.wait(50);

      await pool.stop();

      eq(eventLog.events, events);
    });

    it('should wait for dispatched requests to complete before destroying idle resources');

    it('should wait for resources that are being destroyed but havent timed out [could happen if start or acquire times out]');

    it('should segregate resources that timeout while being destroyed', async () => {
      const factory = new TestFactory([{ resource: 1, destroyDelay: 200 }]);
      const pool = new Pool({ factory, minPoolSize: 1, destroyTimeout: 100 });
      const eventLog = new EventLog(pool);

      await pool.start();
      await pool.stop();

      eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 0, doomed: 0, segregated: 1, size: 1 });
      eq(eventLog.events, [
        Events.RESOURCE_CREATED,
        Events.RESOURCE_RELEASED,
        Events.RESOURCE_DESTRUCTION_TIMEOUT,
        Events.RESOURCE_SEGREGATED,
      ]);
    });

    it('should tolerate belated destruction of resources that timeout while being destroyed', async () => {
      const factory = new TestFactory([{ resource: 1, destroyDelay: 200 }]);
      const pool = new Pool({ factory, minPoolSize: 1, destroyTimeout: 100 });
      const eventLog = new EventLog(pool);

      await pool.start();
      await pool.stop();
      await scheduler.wait(200);

      eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 0, doomed: 0, segregated: 0, size: 0 });
      eq(eventLog.events, [
        Events.RESOURCE_CREATED,
        Events.RESOURCE_RELEASED,
        Events.RESOURCE_DESTRUCTION_TIMEOUT,
        Events.RESOURCE_SEGREGATED,
        Events.RESOURCE_DESTROYED,
      ]);
    });

    it('should segregate resources that error while being destroyed', async () => {
      const factory = new TestFactory([{ resource: 1, destroyError: 'Oh Noes!' }]);
      const pool = new Pool({ factory, minPoolSize: 1 });
      const eventLog = new EventLog(pool);

      await pool.start();
      await pool.stop();

      eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 0, doomed: 0, segregated: 1, size: 1 });
      eq(eventLog.events, [
        Events.RESOURCE_CREATED,
        Events.RESOURCE_RELEASED,
        Events.RESOURCE_DESTRUCTION_ERROR,
        Events.RESOURCE_SEGREGATED,
      ]);
    });

    it('should tolerate stopping a pool that has not been started', async () => {
      const factory = new TestFactory();
      const pool = new Pool({ factory });

      await pool.stop();

      eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 0, doomed: 0, segregated: 0, size: 0 });
    });

    it('should tolerate concurrent attempts to stop a pool', async () => {
      const factory = new TestFactory([{ resource: 1 }]);
      const pool = new Pool({ factory, minPoolSize: 1 });
      const eventLog = new EventLog(pool);

      await pool.start();
      await Promise.all([pool.stop(), pool.stop(), pool.stop()]);

      eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 0, doomed: 0, segregated: 0, size: 0 });
      eq(eventLog.events, [
        Events.RESOURCE_CREATED,
        Events.RESOURCE_RELEASED,
        Events.RESOURCE_DESTROYED,
      ]);
    });

    it('should reject if the stop times out', async () => {
      const factory = new TestFactory([{ resource: 1, destroyDelay: 200 }]);
      const pool = new Pool({ factory, minPoolSize: 1, stopTimeout: 100 });

      await pool.start();
      await rejects(() => pool.stop(), (error) => {
        eq(error.message, 'Failed to stop pool within 100ms');
        return true;
      });

      eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 0, doomed: 1, segregated: 0, size: 1 });
    });
  });

  describe('acquire', () => {

    describe('idle resources', () => {
      it('should prefer idle resources', async () => {
        const factory = new TestFactory([{ resource: 1 }]);
        const pool = new Pool({ factory, minPoolSize: 1 });
        const eventLog = new EventLog(pool);

        await pool.start();
        const resource = await pool.acquire();
        eq(resource, 1);

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 1, doomed: 0, segregated: 0, size: 1 });
        eq(eventLog.events, [
          Events.RESOURCE_CREATED,
          Events.RESOURCE_RELEASED,
          Events.RESOURCE_ACQUIRED,
        ]);
      });

      it('should maintain the minimum number of idle resources', async () => {
        const factory = new TestFactory([{ resource: 1 }, { resource: 2 }, { resource: 3 }]);
        const pool = new Pool({ factory, minIdleResources: 2 });
        const eventLog = new EventLog(pool);

        await pool.start();
        await pool.acquire();

        await scheduler.wait(100);

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 2, acquired: 1, doomed: 0, segregated: 0, size: 3 });
        eq(eventLog.events, [
          Events.RESOURCE_CREATED,
          Events.RESOURCE_CREATED,
          Events.RESOURCE_RELEASED,
          Events.RESOURCE_RELEASED,
          Events.RESOURCE_ACQUIRED,
          Events.RESOURCE_CREATED,
          Events.RESOURCE_RELEASED,
        ]);
      });
    });

    describe('resource creation', () => {

      it('should create a new resource if the pool is empty', async () => {
        const factory = new TestFactory([{ resource: 1 }]);
        const pool = new Pool({ factory });
        const eventLog = new EventLog(pool);

        const resource = await pool.acquire();

        eq(resource, 1);

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 1, doomed: 0, segregated: 0, size: 1 });
        eq(eventLog.events, [
          Events.RESOURCE_CREATED,
          Events.RESOURCE_ACQUIRED,
        ]);
      });

      it('should create a new resource if all resources have been acquired', async () => {
        const factory = new TestFactory([{ resource: 1 }, { resource: 2 }]);
        const pool = new Pool({ factory });
        const eventLog = new EventLog(pool);

        const resource1 = await pool.acquire();
        eq(resource1, 1);

        const resource2 = await pool.acquire();
        eq(resource2, 2);

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 2, doomed: 0, segregated: 0, size: 2 });
        eq(eventLog.events, [
          Events.RESOURCE_CREATED,
          Events.RESOURCE_ACQUIRED,
          Events.RESOURCE_CREATED,
          Events.RESOURCE_ACQUIRED,
        ]);
      });

      it('should wait until there is an idle resource if the pool has no spare capacity', async () => {
        const factory = new TestFactory([{ resource: 1 }]);
        const pool = new Pool({ factory, maxPoolSize: 1 });
        const eventLog = new EventLog(pool);

        const resource = await pool.acquire();

        await tmin(async () => {
          setTimeout(() => pool.release(resource), 100);
          await pool.acquire();
        }, 99);

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 1, doomed: 0, segregated: 0, size: 1 });
        eq(eventLog.events, [
          Events.RESOURCE_CREATED,
          Events.RESOURCE_ACQUIRED,
          Events.RESOURCE_RELEASED,
          Events.RESOURCE_ACQUIRED,
        ]);
      });

      it('should reject if the maximum queue depth is exceeded', async () => {
        const factory = new TestFactory([{ resource: 1 }]);
        const pool = new Pool({ factory, maxPoolSize: 1, maxQueueSize: 1 });
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

        eq(pool.stats(), { queued: 1, initialising: 0, idle: 0, acquired: 1, doomed: 0, segregated: 0, size: 1 });
        eq(eventLog.events, [
          Events.RESOURCE_CREATED,
          Events.RESOURCE_ACQUIRED,
        ]);
      });

      it('should default to no maximum queue depth', async () => {
        const factory = new TestFactory([{ resource: 1 }]);
        const pool = new Pool({ factory, maxPoolSize: 1 });

        const resource = await pool.acquire();
        const done = PromiseUtils.times(1000, async () => {
          const resource = await pool.acquire();
          await pool.release(resource);
        });

        await scheduler.wait(100);

        eq(pool.stats(), { queued: 1000, initialising: 0, idle: 0, acquired: 1, doomed: 0, segregated: 0, size: 1 });
        pool.release(resource);
        await done;
      });

      it('should retry on resource creation errors', async () => {
        const factory = new TestFactory([{ createError: 'Oh Noes!' }, { resource: 2 }]);
        const pool = new Pool({ factory });
        const eventLog = new EventLog(pool);

        const resource = await pool.acquire();
        eq(resource, 2);

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 1, doomed: 0, segregated: 0, size: 1 });
        eq(eventLog.events, [
          Events.RESOURCE_CREATION_ERROR,
          Events.RESOURCE_CREATED,
          Events.RESOURCE_ACQUIRED,
        ]);
      });

      it('should backoff exponentially after an error creating resources', async () => {
        const factory = new TestFactory([{ createError: 'Oh Noes!' }, { createError: 'Oh Noes!' }, { createError: 'Oh Noes!' }, { resource: 4 }]);
        const pool = new Pool({ factory, minPoolSize: 0 });
        const eventLog = new EventLog(pool);

        await tmin(async () => {
          await pool.acquire();
        }, 100 + 200 + 400);

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 1, doomed: 0, segregated: 0, size: 1 });
        eq(eventLog.events, [
          Events.RESOURCE_CREATION_ERROR,
          Events.RESOURCE_CREATION_ERROR,
          Events.RESOURCE_CREATION_ERROR,
          Events.RESOURCE_CREATED,
          Events.RESOURCE_ACQUIRED,
        ]);
      });

      it('should honour backoff configuration', async () => {
        const factory = new TestFactory([{ createError: 'Oh Noes!' }, { createError: 'Oh Noes!' }, { createError: 'Oh Noes!' }, { resource: 4 }]);
        const pool = new Pool({ factory, backoffInitialValue: 50, backoffFactor: 1.5, backoffMaxValue: 100 });
        const eventLog = new EventLog(pool);

        await tmin(async () => {
          await pool.acquire();
        }, 50 + 75 + 100);

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 1, doomed: 0, segregated: 0, size: 1 });
        eq(eventLog.events, [
          Events.RESOURCE_CREATION_ERROR,
          Events.RESOURCE_CREATION_ERROR,
          Events.RESOURCE_CREATION_ERROR,
          Events.RESOURCE_CREATED,
          Events.RESOURCE_ACQUIRED,
        ]);
      });

      it('should segregate then destroy resources created belatedly', async () => {
        const factory = new TestFactory([{ resource: 1, createDelay: 200 }, { resource: 2 }]);
        const pool = new Pool({ factory, createTimeout: 100, backoffMaxValue: 100 });
        const eventLog = new EventLog(pool);

        await pool.acquire();
        await scheduler.wait(300);

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 1, doomed: 0, segregated: 0, size: 1 });
        eq(eventLog.events, [
          Events.RESOURCE_CREATION_TIMEOUT,
          Events.RESOURCE_SEGREGATED,
          Events.RESOURCE_CREATED,
          Events.RESOURCE_DESTROYED,
          Events.RESOURCE_CREATED,
          Events.RESOURCE_ACQUIRED,
        ]);
      });

      it('should segregate then destroy resources created belatedly that timeout when being destroyed', async () => {
        const factory = new TestFactory([{ resource: 1, createDelay: 200, destroyDelay: 200 }, { resource: 2 }]);
        const pool = new Pool({ factory, createTimeout: 100, destroyTimeout: 100, backoffMaxValue: 0 });
        const eventLog = new EventLog(pool);

        await pool.acquire();
        await scheduler.wait(500);

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 1, doomed: 0, segregated: 0, size: 1 });
        eq(eventLog.events, [
          Events.RESOURCE_CREATION_TIMEOUT,
          Events.RESOURCE_SEGREGATED,
          Events.RESOURCE_CREATED,
          Events.RESOURCE_ACQUIRED,
          Events.RESOURCE_CREATED,
          Events.RESOURCE_DESTRUCTION_TIMEOUT,
          Events.RESOURCE_SEGREGATED,
          Events.RESOURCE_DESTROYED,
        ]);
      });

      it('should permanently segregate resources created belatedly that error when being destroyed', async () => {
        const factory = new TestFactory([{ resource: 1, createDelay: 200, destroyError: 'Oh Noes!' }, { resource: 2 }]);
        const pool = new Pool({ factory, createTimeout: 100, backoffMaxValue: 0 });
        const eventLog = new EventLog(pool);

        await pool.acquire();
        await scheduler.wait(300);

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 1, doomed: 0, segregated: 1, size: 2 });
        eq(eventLog.events, [
          Events.RESOURCE_CREATION_TIMEOUT,
          Events.RESOURCE_SEGREGATED,
          Events.RESOURCE_CREATED,
          Events.RESOURCE_ACQUIRED,
          Events.RESOURCE_CREATED,
          Events.RESOURCE_DESTRUCTION_ERROR,
          Events.RESOURCE_SEGREGATED,
        ]);
      });

      it('should permanently segregate resources created belatedly that timeout then error when being destroyed', async () => {
        const factory = new TestFactory([{ resource: 1, createDelay: 200, destroyDelay: 200, destroyError: 'Oh Noes!' }, { resource: 2 }]);
        const pool = new Pool({ factory, createTimeout: 100, destroyTimeout: 100, backoffMaxValue: 0 });
        const eventLog = new EventLog(pool);

        await pool.acquire();
        await scheduler.wait(500);

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 1, doomed: 0, segregated: 1, size: 2 });
        eq(eventLog.events, [
          Events.RESOURCE_CREATION_TIMEOUT,
          Events.RESOURCE_SEGREGATED,
          Events.RESOURCE_CREATED,
          Events.RESOURCE_ACQUIRED,
          Events.RESOURCE_CREATED,
          Events.RESOURCE_DESTRUCTION_TIMEOUT,
          Events.RESOURCE_SEGREGATED,
          Events.RESOURCE_DESTRUCTION_ERROR,
        ]);
      });
    });

    describe('resource validation', () => {

      it('should validate created resources when configuration specifies ALWAYS', async () => {
        const factory = new TestFactory([{ resource: 1 }]);
        const pool = new Pool({ factory, validate: 'ALWAYS' });
        const eventLog = new EventLog(pool);

        await pool.acquire();

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 1, doomed: 0, segregated: 0, size: 1 });
        eq(eventLog.events, [
          Events.RESOURCE_CREATED,
          Events.RESOURCE_VALIDATED,
          Events.RESOURCE_ACQUIRED,
        ]);
      });

      it('should validate idle resources when configuration specifies ALWAYS', async () => {
        const factory = new TestFactory([{ resource: 1 }]);
        const pool = new Pool({ factory, minPoolSize: 1, validate: 'ALWAYS' });
        const eventLog = new EventLog(pool);

        await pool.start();
        await pool.acquire();

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 1, doomed: 0, segregated: 0, size: 1 });
        eq(eventLog.events, [
          Events.RESOURCE_CREATED,
          Events.RESOURCE_VALIDATED,
          Events.RESOURCE_RELEASED,
          Events.RESOURCE_VALIDATED,
          Events.RESOURCE_ACQUIRED,
        ]);
      });

      it('should validate created resources when configuration specifies CREATE', async () => {
        const factory = new TestFactory([{ resource: 1 }]);
        const pool = new Pool({ factory, validate: 'CREATE' });
        const eventLog = new EventLog(pool);

        await pool.acquire();

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 1, doomed: 0, segregated: 0, size: 1 });
        eq(eventLog.events, [
          Events.RESOURCE_CREATED,
          Events.RESOURCE_VALIDATED,
          Events.RESOURCE_ACQUIRED,
        ]);
      });

      it('should not validate idle resources when configuration specifies CREATE', async () => {
        const factory = new TestFactory([{ resource: 1 }]);
        const pool = new Pool({ factory, minPoolSize: 1, validate: 'CREATE' });
        const eventLog = new EventLog(pool);

        await pool.start();
        await pool.acquire();

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 1, doomed: 0, segregated: 0, size: 1 });
        eq(eventLog.events, [
          Events.RESOURCE_CREATED,
          Events.RESOURCE_VALIDATED,
          Events.RESOURCE_RELEASED,
          Events.RESOURCE_ACQUIRED,
        ]);
      });

      it('should not validate created resources when configuration specifies IDLE', async () => {
        const factory = new TestFactory([{ resource: 1 }]);
        const pool = new Pool({ factory, validate: 'IDLE' });
        const eventLog = new EventLog(pool);

        await pool.acquire();

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 1, doomed: 0, segregated: 0, size: 1 });
        eq(eventLog.events, [
          Events.RESOURCE_CREATED,
          Events.RESOURCE_ACQUIRED,
        ]);
      });

      it('should validate idle resources when configuration specifies IDLE', async () => {
        const factory = new TestFactory([{ resource: 1 }]);
        const pool = new Pool({ factory, minPoolSize: 1, validate: 'IDLE' });
        const eventLog = new EventLog(pool);

        await pool.start();
        await pool.acquire();

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 1, doomed: 0, segregated: 0, size: 1 });
        eq(eventLog.events, [
          Events.RESOURCE_CREATED,
          Events.RESOURCE_RELEASED,
          Events.RESOURCE_VALIDATED,
          Events.RESOURCE_ACQUIRED,
        ]);
      });

      it('should not validate created resources when configuration specifies NEVER', async () => {
        const factory = new TestFactory([{ resource: 1 }]);
        const pool = new Pool({ factory, validate: 'NEVER' });
        const eventLog = new EventLog(pool);

        await pool.acquire();

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 1, doomed: 0, segregated: 0, size: 1 });
        eq(eventLog.events, [
          Events.RESOURCE_CREATED,
          Events.RESOURCE_ACQUIRED,
        ]);
      });

      it('should not validate idle resources when configuration specifies NEVER', async () => {
        const factory = new TestFactory([{ resource: 1 }]);
        const pool = new Pool({ factory, minPoolSize: 1, validate: 'NEVER' });
        const eventLog = new EventLog(pool);

        await pool.start();
        await pool.acquire();

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 1, doomed: 0, segregated: 0, size: 1 });
        eq(eventLog.events, [
          Events.RESOURCE_CREATED,
          Events.RESOURCE_RELEASED,
          Events.RESOURCE_ACQUIRED,
        ]);
      });

      it('should retry on resource validation errors', async () => {
        const factory = new TestFactory([{ resource: 1, validateError: 'Oh Noes!' }, { resource: 2 }]);
        const pool = new Pool({ factory, validate: 'ALWAYS' });
        const eventLog = new EventLog(pool);

        await pool.acquire();

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 1, doomed: 0, segregated: 0, size: 1 });
        eq(eventLog.events, [
          Events.RESOURCE_CREATED,
          Events.RESOURCE_VALIDATION_ERROR,
          Events.RESOURCE_SEGREGATED,
          Events.RESOURCE_DESTROYED,
          Events.RESOURCE_CREATED,
          Events.RESOURCE_VALIDATED,
          Events.RESOURCE_ACQUIRED,
        ]);
      });

      it('should backoff exponentially after an error validating resources', async () => {
        const factory = new TestFactory([{ validateError: 'Oh Noes!' }, { validateError: 'Oh Noes!' }, { validateError: 'Oh Noes!' }, { resource: 4 }]);
        const pool = new Pool({ factory, validate: 'ALWAYS' });
        const eventLog = new EventLog(pool);

        await tmin(async () => {
          await pool.acquire();
        }, 100 + 200 + 400);

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 1, doomed: 0, segregated: 0, size: 1 });
        eq(eventLog.events, [
          Events.RESOURCE_CREATED,
          Events.RESOURCE_VALIDATION_ERROR,
          Events.RESOURCE_SEGREGATED,
          Events.RESOURCE_DESTROYED,
          Events.RESOURCE_CREATED,
          Events.RESOURCE_VALIDATION_ERROR,
          Events.RESOURCE_SEGREGATED,
          Events.RESOURCE_DESTROYED,
          Events.RESOURCE_CREATED,
          Events.RESOURCE_VALIDATION_ERROR,
          Events.RESOURCE_SEGREGATED,
          Events.RESOURCE_DESTROYED,
          Events.RESOURCE_CREATED,
          Events.RESOURCE_VALIDATED,
          Events.RESOURCE_ACQUIRED,
        ]);
      });

      it('should honour backoff configuration', async () => {
        const factory = new TestFactory([{ validateError: 'Oh Noes!' }, { validateError: 'Oh Noes!' }, { validateError: 'Oh Noes!' }, { resource: 4 }]);
        const pool = new Pool({ factory, backoffInitialValue: 50, backoffFactor: 1.5, backoffMaxValue: 100, validate: 'ALWAYS' });
        const eventLog = new EventLog(pool);

        await tmin(async () => {
          await pool.acquire();
        }, 50 + 75 + 100);

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 1, doomed: 0, segregated: 0, size: 1 });
        eq(eventLog.events, [
          Events.RESOURCE_CREATED,
          Events.RESOURCE_VALIDATION_ERROR,
          Events.RESOURCE_SEGREGATED,
          Events.RESOURCE_DESTROYED,
          Events.RESOURCE_CREATED,
          Events.RESOURCE_VALIDATION_ERROR,
          Events.RESOURCE_SEGREGATED,
          Events.RESOURCE_DESTROYED,
          Events.RESOURCE_CREATED,
          Events.RESOURCE_VALIDATION_ERROR,
          Events.RESOURCE_SEGREGATED,
          Events.RESOURCE_DESTROYED,
          Events.RESOURCE_CREATED,
          Events.RESOURCE_VALIDATED,
          Events.RESOURCE_ACQUIRED,
        ]);
      });

      it('should segregate then destroy resources validated belatedly', async () => {
        const factory = new TestFactory([{ resource: 1, validateDelay: 200 }, { resource: 2 }]);
        const pool = new Pool({ factory, validateTimeout: 100, backoffMaxValue: 100, validate: 'ALWAYS' });
        const eventLog = new EventLog(pool);

        await pool.acquire();
        await scheduler.wait(300);

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 1, doomed: 0, segregated: 0, size: 1 });
        eq(eventLog.events, [
          Events.RESOURCE_CREATED,
          Events.RESOURCE_VALIDATION_TIMEOUT,
          Events.RESOURCE_SEGREGATED,
          Events.RESOURCE_VALIDATED,
          Events.RESOURCE_DESTROYED,
          Events.RESOURCE_CREATED,
          Events.RESOURCE_VALIDATED,
          Events.RESOURCE_ACQUIRED,
        ]);
      });

      it('should segregate then destroy resources validated belatedly that timeout when being destroyed', async () => {
        const factory = new TestFactory([{ resource: 1, validateDelay: 200, destroyDelay: 200 }, { resource: 2 }]);
        const pool = new Pool({ factory, validateTimeout: 100, destroyTimeout: 100, backoffMaxValue: 0, validate: 'ALWAYS' });
        const eventLog = new EventLog(pool);

        await pool.acquire();
        await scheduler.wait(500);

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 1, doomed: 0, segregated: 0, size: 1 });
        eq(eventLog.events, [
          Events.RESOURCE_CREATED,
          Events.RESOURCE_VALIDATION_TIMEOUT,
          Events.RESOURCE_SEGREGATED,
          Events.RESOURCE_CREATED,
          Events.RESOURCE_VALIDATED,
          Events.RESOURCE_ACQUIRED,
          Events.RESOURCE_VALIDATED,
          Events.RESOURCE_DESTRUCTION_TIMEOUT,
          Events.RESOURCE_SEGREGATED,
          Events.RESOURCE_DESTROYED,
        ]);
      });

      it('should permanently segregate resources validated belatedly that error when being destroyed', async () => {
        const factory = new TestFactory([{ resource: 1, validateDelay: 200, destroyError: 'Oh Noes!' }, { resource: 2 }]);
        const pool = new Pool({ factory, validateTimeout: 100, backoffMaxValue: 0, validate: 'ALWAYS' });
        const eventLog = new EventLog(pool);

        await pool.acquire();
        await scheduler.wait(300);

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 1, doomed: 0, segregated: 1, size: 2 });
        eq(eventLog.events, [
          Events.RESOURCE_CREATED,
          Events.RESOURCE_VALIDATION_TIMEOUT,
          Events.RESOURCE_SEGREGATED,
          Events.RESOURCE_CREATED,
          Events.RESOURCE_VALIDATED,
          Events.RESOURCE_ACQUIRED,
          Events.RESOURCE_VALIDATED,
          Events.RESOURCE_DESTRUCTION_ERROR,
          Events.RESOURCE_SEGREGATED,
        ]);
      });

      it('should permanently segregate resources validated belatedly that timeout then error when being destroyed', async () => {
        const factory = new TestFactory([{ resource: 1, validateDelay: 200, destroyDelay: 200, destroyError: 'Oh Noes!' }, { resource: 2 }]);
        const pool = new Pool({ factory, validateTimeout: 100, destroyTimeout: 100, backoffMaxValue: 0, validate: 'ALWAYS' });
        const eventLog = new EventLog(pool);

        await pool.acquire();
        await scheduler.wait(500);

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 1, doomed: 0, segregated: 1, size: 2 });
        eq(eventLog.events, [
          Events.RESOURCE_CREATED,
          Events.RESOURCE_VALIDATION_TIMEOUT,
          Events.RESOURCE_SEGREGATED,
          Events.RESOURCE_CREATED,
          Events.RESOURCE_VALIDATED,
          Events.RESOURCE_ACQUIRED,
          Events.RESOURCE_VALIDATED,
          Events.RESOURCE_DESTRUCTION_TIMEOUT,
          Events.RESOURCE_SEGREGATED,
          Events.RESOURCE_DESTRUCTION_ERROR,
        ]);
      });
    });

    describe('acquire timeout', () => {

      it('should reject if the acquire times out during resource creation', async () => {
        const factory = new TestFactory([{ resource: 1, createDelay: 200 }]);
        const pool = new Pool({ factory, acquireTimeout: 100 });

        await rejects(() => pool.acquire(), (error) => {
          eq(error.message, 'Failed to acquire resource within 100ms');
          return true;
        });
      });

      it('should reject if the acquire times out during resource validation', async () => {
        const factory = new TestFactory([{ resource: 1, validateDelay: 200 }]);
        const pool = new Pool({ factory, acquireTimeout: 100, validate: 'ALWAYS' });

        await rejects(() => pool.acquire(), (error) => {
          eq(error.message, 'Failed to acquire resource within 100ms');
          return true;
        });
      });

      it('should segregate then destroy resources created belatedly after the acquire times out', async () => {
        const factory = new TestFactory([{ resource: 1, createDelay: 200 }]);
        const pool = new Pool({ factory, acquireTimeout: 100 });
        const eventLog = new EventLog(pool);

        await rejects(() => pool.acquire(), (error) => {
          eq(error.message, 'Failed to acquire resource within 100ms');
          return true;
        });
        await scheduler.wait(300);

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 0, doomed: 0, segregated: 0, size: 0 });
        eq(eventLog.events, [
          Events.RESOURCE_SEGREGATED,
          Events.RESOURCE_CREATED,
          Events.RESOURCE_DESTROYED,
        ]);
      });

      it('should segregate then destroy resources validated belatedly after the acquire times out', async () => {
        const factory = new TestFactory([{ resource: 1, validateDelay: 200 }]);
        const pool = new Pool({ factory, acquireTimeout: 100, validate: 'ALWAYS' });
        const eventLog = new EventLog(pool);

        await rejects(() => pool.acquire(), (error) => {
          eq(error.message, 'Failed to acquire resource within 100ms');
          return true;
        });
        await scheduler.wait(300);

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 0, doomed: 0, segregated: 0, size: 0 });
        eq(eventLog.events, [
          Events.RESOURCE_CREATED,
          Events.RESOURCE_SEGREGATED,
          Events.RESOURCE_VALIDATED,
          Events.RESOURCE_DESTROYED,
        ]);
      });

      it('should remove queued requests if acquire times out', async () => {
        const factory = new TestFactory([{ resource: 1 }]);
        const pool = new Pool({ factory, maxPoolSize: 1, acquireTimeout: 100 });

        // Block the queue by acquiring the only resource
        await pool.acquire();

        await rejects(() => pool.acquire(), (error) => {
          eq(error.message, 'Failed to acquire resource within 100ms');
          return true;
        });

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 1, doomed: 0, segregated: 0, size: 1 });
      });

      it('should check for other queued requests after the acquire times out', async () => {
        const factory = new TestFactory([{ resource: 1, createDelay: 600 }, { resource: 2, createDelay: 100 }]);
        const pool = new Pool({ factory, maxPoolSize: 1, acquireTimeout: 500 });
        const eventLog = new EventLog(pool);

        // T+0ms first acquire is queued
        // T+300ms second acquire is queued
        // T+500ms first acquire times out & aborts, second acquire is dispatched
        // T+600ms second acquire is fulfilled

        pool.acquire().catch(() => {});
        await scheduler.wait(300);
        await pool.acquire();

        eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 1, doomed: 0, segregated: 0, size: 1 });
        eq(eventLog.events, [
          Events.RESOURCE_SEGREGATED,
          Events.RESOURCE_CREATED,
          Events.RESOURCE_DESTROYED,
          Events.RESOURCE_CREATED,
          Events.RESOURCE_ACQUIRED,
        ]);
      });
    });
  });

  describe('release', () => {

    it('should release resources returned to the pool', async () => {
      const factory = new TestFactory([{ resource: 1 }]);
      const pool = new Pool({ factory });
      const eventLog = new EventLog(pool);

      const resource = await pool.acquire();

      await pool.release(resource);

      eq(pool.stats(), { queued: 0, initialising: 0, idle: 1, acquired: 0, doomed: 0, segregated: 0, size: 1 });
      eq(eventLog.events, [
        Events.RESOURCE_CREATED,
        Events.RESOURCE_ACQUIRED,
        Events.RESOURCE_RELEASED,
      ]);
    });

    it('should tolerate attempts to release an unmanaged resource', async () => {
      const factory = new TestFactory();
      const pool = new Pool({ factory });
      const eventLog = new EventLog(pool);

      await pool.release(2);

      eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 0, doomed: 0, segregated: 0, size: 0 });
      eq(eventLog.events, []);
    });
  });

  describe('destroy', () => {

    it('should destroy resources returned to the pool', async () => {
      const factory = new TestFactory([{ resource: 1 }]);
      const pool = new Pool({ factory });
      const eventLog = new EventLog(pool);

      const resource = await pool.acquire();

      await pool.destroy(resource);

      eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 0, doomed: 0, segregated: 0, size: 0 });
      eq(eventLog.events, [
        Events.RESOURCE_CREATED,
        Events.RESOURCE_ACQUIRED,
        Events.RESOURCE_DESTROYED,
      ]);
    });

    it('should segregate resources that error while being destroyed', async () => {
      const factory = new TestFactory([{ resource: 1, destroyError: 'Oh Noes!' }]);
      const pool = new Pool({ factory });
      const eventLog = new EventLog(pool);

      const resource = await pool.acquire();

      await pool.destroy(resource);

      eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 0, doomed: 0, segregated: 1, size: 1 });
      eq(eventLog.events, [
        Events.RESOURCE_CREATED,
        Events.RESOURCE_ACQUIRED,
        Events.RESOURCE_DESTRUCTION_ERROR,
        Events.RESOURCE_SEGREGATED,
      ]);
    });

    it('should segregate then destroy resources that time out while being destroyed', async () => {
      const factory = new TestFactory([{ resource: 1, destroyDelay: 200 }]);
      const pool = new Pool({ factory, destroyTimeout: 100 });
      const eventLog = new EventLog(pool);

      const resource = await pool.acquire();

      await pool.destroy(resource);

      await scheduler.wait(300);

      eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 0, doomed: 0, segregated: 0, size: 0 });
      eq(eventLog.events, [
        Events.RESOURCE_CREATED,
        Events.RESOURCE_ACQUIRED,
        Events.RESOURCE_DESTRUCTION_TIMEOUT,
        Events.RESOURCE_SEGREGATED,
        Events.RESOURCE_DESTROYED,
      ]);
    });

    it('should permanently segregate resources created belatedly that error while being destroyed', async () => {
      const factory = new TestFactory([{ resource: 1, destroyDelay: 200, destroyError: 'Oh Noes!' }]);
      const pool = new Pool({ factory, destroyTimeout: 100 });
      const eventLog = new EventLog(pool);

      const resource = await pool.acquire();

      await pool.destroy(resource);

      await scheduler.wait(300);

      eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 0, doomed: 0, segregated: 1, size: 1 });
      eq(eventLog.events, [
        Events.RESOURCE_CREATED,
        Events.RESOURCE_ACQUIRED,
        Events.RESOURCE_DESTRUCTION_TIMEOUT,
        Events.RESOURCE_SEGREGATED,
        Events.RESOURCE_DESTRUCTION_ERROR,
      ]);
    });

    it('should tolerate attempts to destroy an unmanaged resource', async () => {
      const factory = new TestFactory();
      const pool = new Pool({ factory });
      const eventLog = new EventLog(pool);

      await pool.destroy(2);

      eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 0, doomed: 0, segregated: 0, size: 0 });
      eq(eventLog.events, []);
    });

    it('should maintain the minimum pool size', async () => {
      const factory = new TestFactory([{ resource: 1 }, { resource: 2 }]);
      const pool = new Pool({ factory, minPoolSize: 1 });
      const eventLog = new EventLog(pool);

      await pool.start();
      const resource = await pool.acquire();
      await pool.destroy(resource);

      await scheduler.wait(100);

      eq(pool.stats(), { queued: 0, initialising: 0, idle: 1, acquired: 0, doomed: 0, segregated: 0, size: 1 });
      eq(eventLog.events, [
        Events.RESOURCE_CREATED,
        Events.RESOURCE_RELEASED,
        Events.RESOURCE_ACQUIRED,
        Events.RESOURCE_DESTROYED,
        Events.RESOURCE_CREATED,
        Events.RESOURCE_RELEASED,
      ]);
    });

    it('should maintain the minimum pool size even with concurrent destroys', async () => {
      const factory = new TestFactory([{ resource: 1, destroyDelay: 100 }, { resource: 2, destroyDelay: 100 }, { resource: 3, destroyDelay: 100 }, { resource: 4 }, { resource: 5 }, { resource: 6 }]);
      const pool = new Pool({ factory, minPoolSize: 3 });

      await pool.start();

      PromiseUtils.times(3, async () => {
        const resource = await pool.acquire();
        pool.destroy(resource);
      });

      await scheduler.wait(500);

      eq(pool.stats(), { queued: 0, initialising: 0, idle: 3, acquired: 0, doomed: 0, segregated: 0, size: 3 });
    });

    it('should tolerate errors refilling the pool', async () => {
      const factory = new TestFactory([{ resource: 1 }, { resource: 2, createError: 'Oh Noes!' }, { resource: 3 }]);
      const pool = new Pool({ factory, minPoolSize: 1 });
      const eventLog = new EventLog(pool);

      await pool.start();
      const resource = await pool.acquire();
      await pool.destroy(resource);

      await scheduler.wait(300);

      eq(pool.stats(), { queued: 0, initialising: 0, idle: 1, acquired: 0, doomed: 0, segregated: 0, size: 1 });
      eq(eventLog.events, [
        Events.RESOURCE_CREATED,
        Events.RESOURCE_RELEASED,
        Events.RESOURCE_ACQUIRED,
        Events.RESOURCE_DESTROYED,
        Events.RESOURCE_CREATION_ERROR,
        Events.RESOURCE_CREATED,
        Events.RESOURCE_RELEASED,
      ]);
    });
  });

  describe('with', () => {
    it('should acquire and release resources', async () => {
      const factory = new TestFactory([{ resource: 1 }]);
      const pool = new Pool({ factory, minPoolSize: 1 });
      const eventLog = new EventLog(pool);

      await pool.start();
      await pool.with((resource) => {
        eq(resource, 1);
      });

      eq(pool.stats(), { queued: 0, initialising: 0, idle: 1, acquired: 0, doomed: 0, segregated: 0, size: 1 });
      eq(eventLog.events, [
        Events.RESOURCE_CREATED,
        Events.RESOURCE_RELEASED,
        Events.RESOURCE_ACQUIRED,
        Events.RESOURCE_RELEASED,
      ]);
    });

    it('should yield synchronous function result', async () => {
      const factory = new TestFactory([{ resource: 1 }]);
      const pool = new Pool({ factory, minPoolSize: 1 });

      await pool.start();
      const result = await pool.with(() => 'ok');

      eq(result, 'ok');
    });

    it('should yield asynchronous function result', async () => {
      const factory = new TestFactory([{ resource: 1 }]);
      const pool = new Pool({ factory, minPoolSize: 1 });

      await pool.start();
      const result = await pool.with(async () => Promise.resolve('ok'));

      eq(result, 'ok');
    });

    it('should reject errors thrown by the function', async () => {
      const factory = new TestFactory([{ resource: 1 }]);
      const pool = new Pool({ factory, minPoolSize: 1 });

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
      const pool = new Pool({ factory, acquireTimeout: 100 });

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
      const pool = new Pool();
      eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 0, doomed: 0, segregated: 0, size: 0 });
    });
  });
});
