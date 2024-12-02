const { describe, it } = require('zunit');
const { deepStrictEqual: eq, rejects, fail } = require('node:assert');
const { scheduler } = require('node:timers/promises');
const { Pool, Events } = require('..');
const PromiseUtils = require('../lib/utils/PromiseUtils');
const TestFactory = require('./lib/TestFactory');
const EventLog = require('./lib/EventLog');
const { takesAtLeast: tmin } = require('./lib/custom-assertions');

describe('XPool', () => {

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

    it('should fail if the pool has already been started', async () => {
      const factory = new TestFactory();
      const pool = new Pool({ factory });
      await pool.start();

      await rejects(() => pool.start(), (error) => {
        eq(error.message, 'The pool has already been started');
        return true;
      });
    });

    it('should fail if the pool has already been stopped', async () => {
      const factory = new TestFactory();
      const pool = new Pool({ factory });

      await pool.stop();

      await rejects(() => pool.start(), (error) => {
        eq(error.message, 'The pool has already been stopped');
        return true;
      });
    });

    it('should create the minimum number of resources', async () => {
      const factory = new TestFactory([{ resource: 1 }, { resource: 2 }, { resource: 3 }]);
      const pool = new Pool({ factory, minPoolSize: 2 });

      await pool.start();

      eq(pool.stats(), { queued: 0, initialising: 0, idle: 2, acquired: 0, doomed: 0, segregated: 0, size: 2 });
    });

    it('should create the minimum number of idle resources', async () => {
      const factory = new TestFactory([{ resource: 1 }, { resource: 2 }]);
      const pool = new Pool({ factory, minIdleResources: 2 });

      await pool.start();

      eq(pool.stats(), { queued: 0, initialising: 0, idle: 2, acquired: 0, doomed: 0, segregated: 0, size: 2 });
    });

    it('should tolerate errors creating resources', async () => {
      const factory = new TestFactory([{ resource: 1 }, { createError: 'Oh Noes!' }, { resource: 3 }]);
      const pool = new Pool({ factory, minPoolSize: 2 });

      await pool.start();

      eq(pool.stats(), { queued: 0, initialising: 0, idle: 2, acquired: 0, doomed: 0, segregated: 0, size: 2 });
    });

    it('should report errors creating resources', async () => {
      const factory = new TestFactory([{ resource: 1 }, { createError: 'Oh Noes!' }, { resource: 3 }]);
      const pool = new Pool({ factory, minPoolSize: 2 });
      const eventLog = new EventLog(pool, Object.values(Events));

      await pool.start();

      eq(pool.stats(), { queued: 0, initialising: 0, idle: 2, acquired: 0, doomed: 0, segregated: 0, size: 2 });
      eq(eventLog.events, [
        Events.RESOURCE_CREATED,
        Events.RESOURCE_CREATION_ERROR,
        Events.RESOURCE_RELEASED,
        Events.RESOURCE_CREATED,
        Events.RESOURCE_RELEASED,
      ]);
    });

    it('should backoff exponentially after an error creating resources', async () => {
      const factory = new TestFactory([{ createError: 'Oh Noes!' }, { createError: 'Oh Noes!' }, { createError: 'Oh Noes!' }, { resource: 4 }]);
      const pool = new Pool({ factory, minPoolSize: 1 });
      const eventLog = new EventLog(pool, Object.values(Events));

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
      const pool = new Pool({ factory, minPoolSize: 1, backoff: { initialValue: 50, factor: 1.5, maxValue: 100 } });
      const eventLog = new EventLog(pool, Object.values(Events));

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
      const pool = new Pool({ factory, minPoolSize: 2, createTimeout: 100, backoff: { maxValue: 0 } });
      const eventLog = new EventLog(pool, Object.values(Events));

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

    it('should segregate and eventually destroy resources created belatedly that timeout while being destroyed', async () => {
      const factory = new TestFactory([{ resource: 1 }, { createDelay: 200, destroyDelay: 200 }, { resource: 3 }]);
      const pool = new Pool({ factory, minPoolSize: 2, createTimeout: 100, destroyTimeout: 100 });

      const eventLog = new EventLog(pool, [
        Events.RESOURCE_CREATED,
        Events.RESOURCE_CREATION_TIMEOUT,
        Events.RESOURCE_SEGREGATED,
        Events.RESOURCE_DESTRUCTION_TIMEOUT,
        Events.RESOURCE_DESTROYED,
      ]);

      await pool.start();
      await scheduler.wait(500);

      eq(pool.stats(), { queued: 0, initialising: 0, idle: 2, acquired: 0, doomed: 0, segregated: 0, size: 2 });
      eq(eventLog.events, [
        Events.RESOURCE_CREATED,
        Events.RESOURCE_CREATION_TIMEOUT,
        Events.RESOURCE_SEGREGATED,
        Events.RESOURCE_CREATED,
        Events.RESOURCE_CREATED,
        Events.RESOURCE_DESTRUCTION_TIMEOUT,
        Events.RESOURCE_SEGREGATED,
        Events.RESOURCE_DESTROYED,
      ]);
    });

    it('should permanently segregate resources created belatedly that error while being destroyed', async () => {
      const factory = new TestFactory([{ resource: 1 }, { createDelay: 200, destroyError: 'Oh Noes!' }, { resource: 3 }]);
      const pool = new Pool({ factory, minPoolSize: 2, createTimeout: 100, backoff: { maxValue: 0 } });
      const eventLog = new EventLog(pool, Object.values(Events));

      await pool.start();
      await scheduler.wait(300);

      eq(pool.stats(), { queued: 0, initialising: 0, idle: 2, acquired: 0, doomed: 0, segregated: 1, size: 3 });
      eq(eventLog.events, [
        Events.RESOURCE_CREATED,
        Events.RESOURCE_RELEASED,
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
      const factory = new TestFactory([{ resource: 1 }, { createDelay: 200, destroyDelay: 200, destroyError: 'Oh Noes!' }, { resource: 3 }]);
      const pool = new Pool({ factory, minPoolSize: 2, createTimeout: 100, destroyTimeout: 100, backoff: { maxValue: 0 } });
      const eventLog = new EventLog(pool, Object.values(Events));

      await pool.start();
      await scheduler.wait(500);

      eq(pool.stats(), { queued: 0, initialising: 0, idle: 2, acquired: 0, doomed: 0, segregated: 1, size: 3 });
      eq(eventLog.events, [
        Events.RESOURCE_CREATED,
        Events.RESOURCE_RELEASED,
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

    it('should default to no minimum pool size', async () => {
      const factory = new TestFactory([{ resource: 1 }, { resource: 2 }, { resource: 3 }]);
      const pool = new Pool({ factory });
      const eventLog = new EventLog(pool, Object.values(Events));

      await pool.start();

      eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 0, doomed: 0, segregated: 0, size: 0 });
      eq(eventLog.events, []);
    });

    it('should reject if the start times out', async () => {
      const factory = new TestFactory([{ resource: 1, createDelay: 200 }]);
      const pool = new Pool({ factory, minPoolSize: 1, startTimeout: 100 });

      await rejects(() => pool.start(), (error) => {
        eq(error.message, 'Failed to start pool within 100ms');
        return true;
      });
    });

    it('should segregate resources created belatedly if start times out', async () => {
      const factory = new TestFactory([{ resource: 1, createDelay: 200 }]);
      const pool = new Pool({ factory, minPoolSize: 1, startTimeout: 100 });
      const eventLog = new EventLog(pool, Object.values(Events));

      await rejects(() => pool.start(), (error) => {
        eq(error.message, 'Failed to start pool within 100ms');
        return true;
      });

      eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 0, doomed: 0, segregated: 1, size: 1 });
      eq(eventLog.events, [
        Events.RESOURCE_SEGREGATED,
      ]);
    });
  });

  describe('stop', () => {

    it('should wait for the pool to finish initialising', async () => {
      const factory = new TestFactory([{ resource: 1, createDelay: 100 }, { resource: 2, createDelay: 100 }, { resource: 3, createDelay: 100 }]);
      const pool = new Pool({ factory, minPoolSize: 3 });

      pool.start();
      await pool.stop();

      eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 0, doomed: 0, segregated: 0, size: 0 });
    });

    it('should fail new acquisition requests', async () => {
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

    it('should cull idle resources', async () => {
      const factory = new TestFactory([{ resource: 1 }, { resource: 2 }, { resource: 3 }]);
      const pool = new Pool({ factory, minPoolSize: 3 });
      const eventLog = new EventLog(pool, Object.values(Events));

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

    it('should ignore segregated resources', async () => {
      const factory = new TestFactory([{ resource: 1, createDelay: 200 }]);
      const pool = new Pool({ factory, minPoolSize: 1, startTimeout: 100 });
      const eventLog = new EventLog(pool, Object.values(Events));

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

    it('should wait for queued requests to complete before culling resources', async () => {
      const factory = new TestFactory([{ resource: 1 }]);
      const pool = new Pool({ factory, minPoolSize: 1, maxPoolSize: 1 });
      const eventLog = new EventLog(pool, Object.values(Events));

      await pool.start();

      const events = [Events.RESOURCE_CREATED, Events.RESOURCE_RELEASED];
      PromiseUtils.times(10, async () => {
        events.push(Events.RESOURCE_ACQUIRED, Events.RESOURCE_RELEASED);
        const resource = await pool.acquire();
        setTimeout(() => pool.release(resource), 100);
      });
      events.push(Events.RESOURCE_DESTROYED);

      await pool.stop();

      eq(eventLog.events, events);
    });

    it('should segregate resources that timeout while being destroyed', async () => {
      const factory = new TestFactory([{ resource: 1, destroyDelay: 200 }]);
      const pool = new Pool({ factory, minPoolSize: 1, destroyTimeout: 100 });
      const eventLog = new EventLog(pool, Object.values(Events));

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
      const eventLog = new EventLog(pool, Object.values(Events));

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
      const eventLog = new EventLog(pool, Object.values(Events));

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
      const eventLog = new EventLog(pool, Object.values(Events));

      await pool.start();
      await Promise.all([pool.stop(), pool.stop(), pool.stop()]);

      eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 0, doomed: 0, segregated: 0, size: 0 });
      eq(eventLog.events, [
        Events.RESOURCE_CREATED,
        Events.RESOURCE_RELEASED,
        Events.RESOURCE_DESTROYED,
      ]);
    });

    it('should fail if the stop times out', async () => {
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

    it('should use an idle resource if one is available', async () => {
      const factory = new TestFactory([{ resource: 1 }]);
      const pool = new Pool({ factory, minPoolSize: 1 });
      const eventLog = new EventLog(pool, Object.values(Events));

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

    it('should create a new resource if the pool is empty', async () => {
      const factory = new TestFactory([{ resource: 1 }]);
      const pool = new Pool({ factory });
      const eventLog = new EventLog(pool, Object.values(Events));

      const resource = await pool.acquire();

      eq(resource, 1);

      eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 1, doomed: 0, segregated: 0, size: 1 });
      eq(eventLog.events, [
        Events.RESOURCE_CREATED,
        Events.RESOURCE_ACQUIRED,
      ]);
    });

    it('should create a new resource if all resources are busy', async () => {
      const factory = new TestFactory([{ resource: 1 }, { resource: 2 }]);
      const pool = new Pool({ factory });
      const eventLog = new EventLog(pool, Object.values(Events));

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

    it('should wait until there is an idle resource if the pool is fully utilised', async () => {
      const factory = new TestFactory([{ resource: 1 }]);
      const pool = new Pool({ factory, maxPoolSize: 1 });
      const eventLog = new EventLog(pool, Object.values(Events));

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
      const eventLog = new EventLog(pool, Object.values(Events));

      await pool.acquire();
      pool.acquire();
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

      await pool.acquire();
      PromiseUtils.times(1000, async () => {
        pool.acquire();
      });

      eq(pool.stats(), { queued: 1000, initialising: 0, idle: 0, acquired: 1, doomed: 0, segregated: 0, size: 1 });
    });

    it('should retry on resource creation error', async () => {
      const factory = new TestFactory([{ createError: 'Oh Noes!' }, { resource: 2 }]);
      const pool = new Pool({ factory });
      const eventLog = new EventLog(pool, Object.values(Events));

      const resource = await pool.acquire();
      eq(resource, 2);

      eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 1, doomed: 0, segregated: 0, size: 1 });
      eq(eventLog.events, [
        Events.RESOURCE_CREATION_ERROR,
        Events.RESOURCE_CREATED,
        Events.RESOURCE_ACQUIRED,
      ]);
    });

    it('should segregate then destroy resources created belatedly', async () => {
      const factory = new TestFactory([{ resource: 1, createDelay: 200 }, { resource: 2 }]);
      const pool = new Pool({ factory, createTimeout: 100, backoff: { maxValue: 100 } });
      const eventLog = new EventLog(pool, Object.values(Events));

      await pool.acquire();
      await scheduler.wait(300);

      eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 1, doomed: 0, segregated: 0, size: 1 });
      eq(eventLog.events, [
        Events.RESOURCE_CREATION_TIMEOUT,
        Events.RESOURCE_SEGREGATED,
        Events.RESOURCE_CREATED,
        Events.RESOURCE_ACQUIRED,
        Events.RESOURCE_CREATED,
        Events.RESOURCE_DESTROYED,
      ]);
    });

    it('should permanently segregate resources created belatedly that error when being destroyed', async () => {
      const factory = new TestFactory([{ resource: 1, createDelay: 200, destroyError: 'Oh Noes!' }, { resource: 2 }]);
      const pool = new Pool({ factory, createTimeout: 100, backoff: { maxValue: 0 } });
      const eventLog = new EventLog(pool, Object.values(Events));

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

    it('should segregate and eventually destroy resources created belatedly that timeout when being destroyed', async () => {
      const factory = new TestFactory([{ resource: 1, createDelay: 200, destroyDelay: 200 }, { resource: 2 }]);
      const pool = new Pool({ factory, createTimeout: 100, destroyTimeout: 100, backoff: { maxValue: 0 } });
      const eventLog = new EventLog(pool, Object.values(Events));

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
      const pool = new Pool({ factory, createTimeout: 100, backoff: { maxValue: 0 } });
      const eventLog = new EventLog(pool, Object.values(Events));

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
      const pool = new Pool({ factory, createTimeout: 100, destroyTimeout: 100, backoff: { maxValue: 0 } });
      const eventLog = new EventLog(pool, Object.values(Events));

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

    it('should reject if the acquire times out', async () => {
      const factory = new TestFactory([{ resource: 1, createDelay: 200 }]);
      const pool = new Pool({ factory, acquireTimeout: 100 });

      await rejects(() => pool.acquire(), (error) => {
        eq(error.message, 'Failed to acquire resource within 100ms');
        return true;
      });
    });

    it('should segregate then destroy resources created belatedly after the acquire timeout', async () => {
      const factory = new TestFactory([{ resource: 1, createDelay: 200 }]);
      const pool = new Pool({ factory, acquireTimeout: 100 });
      const eventLog = new EventLog(pool, Object.values(Events));

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

    it('should maintain the minimum number of idle resources', async () => {
      const factory = new TestFactory([{ resource: 1 }, { resource: 2 }, { resource: 3 }]);
      const pool = new Pool({ factory, minIdleResources: 2 });
      const eventLog = new EventLog(pool, Object.values(Events));

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

  describe('release', () => {

    it('should release resources returned to the pool', async () => {
      const factory = new TestFactory([{ resource: 1 }]);
      const pool = new Pool({ factory });
      const eventLog = new EventLog(pool, Object.values(Events));

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
      const eventLog = new EventLog(pool, Object.values(Events));

      await pool.release(2);

      eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 0, doomed: 0, segregated: 0, size: 0 });
      eq(eventLog.events, []);
    });
  });

  describe('destroy', () => {

    it('should destroy resources returned to the pool', async () => {
      const factory = new TestFactory([{ resource: 1 }]);
      const pool = new Pool({ factory });
      const eventLog = new EventLog(pool, Object.values(Events));

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
      const eventLog = new EventLog(pool, Object.values(Events));

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
      const eventLog = new EventLog(pool, Object.values(Events));

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
      const eventLog = new EventLog(pool, Object.values(Events));

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
      const eventLog = new EventLog(pool, Object.values(Events));

      await pool.destroy(2);

      eq(pool.stats(), { queued: 0, initialising: 0, idle: 0, acquired: 0, doomed: 0, segregated: 0, size: 0 });
      eq(eventLog.events, []);
    });

    it('should maintain the minimum pool size', async () => {
      const factory = new TestFactory([{ resource: 1 }, { resource: 2 }]);
      const pool = new Pool({ factory, minPoolSize: 1 });
      const eventLog = new EventLog(pool, Object.values(Events));

      await pool.start();
      const resource = await pool.acquire();
      await pool.destroy(resource);

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
      const factory = new TestFactory([{ resource: 1 }, { resource: 2, createError: 200 }, { resource: 2 }]);
      const pool = new Pool({ factory, minPoolSize: 1, startTimeout: 100 });
      const eventLog = new EventLog(pool, Object.values(Events));

      await pool.start();
      const resource = await pool.acquire();
      await pool.destroy(resource);

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
      const eventLog = new EventLog(pool, Object.values(Events));

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
