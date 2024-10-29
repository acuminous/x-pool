const { describe, it } = require('zunit');
const { deepStrictEqual: eq } = require('node:assert');
const Request = require('../lib/Request');
const QueueStats = require('../lib/QueueStats');

describe('Request', () => {

  describe('constructor', () => {
    it('should initialize with an id and handler', () => {
      const stats = new QueueStats();

      const request = new Request('1234', () => {}, stats);

      eq(request.id, '1234');
      eq(request.attempts, 0);
    });
  });

  describe('queue', () => {
    it('should mark request as queued in stats', () => {
      const stats = new QueueStats();
      const request = new Request('1234', () => {}, stats);

      request.queue();

      eq(stats.toJSON(), { queued: 1, dispatched: 0 });
    });
  });

  describe('dispatch', () => {
    it('should set the request to dispatched', () => {
      const stats = new QueueStats();
      const handler = (req) => eq(req.id, '1234');
      const request = new Request('1234', handler, stats);

      request.queue();
      request.dispatch();

      eq(stats.toJSON(), { queued: 0, dispatched: 1 });
    });

    it('should increment attempts', () => {
      const stats = new QueueStats();
      const request = new Request('1234', () => {}, stats);

      request.dispatch();
      eq(request.attempts, 1);

      request.dispatch();
      eq(request.attempts, 2);
    });
  });

  describe('requeue', () => {
    it('should set disposition back to queued', () => {
      const stats = new QueueStats();
      const request = new Request('1234', () => {}, stats);

      request.dispatch();
      request.requeue();

      eq(request.isQueued(), true);
    });
  });

  describe('abort', () => {
    it('should set the aborted flag to true', () => {
      const stats = new QueueStats();
      const request = new Request('1234', () => {}, stats);

      request.abort();

      eq(request.isAborted(), true);
    });

    it('should release the response latch', async () => {
      const stats = new QueueStats();
      const request = new Request('1234', () => {}, stats);

      request.abort();

      await request.block();
    });
  });

  describe('remove', () => {
    it('should call removedFromQueued if disposition is queued', () => {
      const stats = new QueueStats();
      const request = new Request('1234', () => {}, stats);

      request.queue();
      request.remove();

      eq(stats.toJSON(), { queued: 0, dispatched: 0 });
    });

    it('should call removedFromDispatched if disposition is dispatched', () => {
      const stats = new QueueStats();
      const request = new Request('1234', () => {}, stats);

      request.queue();
      request.dispatch();
      request.remove();

      eq(stats.toJSON(), { queued: 0, dispatched: 0 });
    });
  });

  describe('block', () => {
    it('should block until released', async () => {
      const stats = new QueueStats();
      const request = new Request('1234', () => {}, stats);

      const promise = request.block();
      setTimeout(() => request.release(), 100);

      await promise;
    });
  });

  describe('release', () => {
    it('should release the response latch with a resource', async () => {
      const stats = new QueueStats();
      const request = new Request('1234', () => {}, stats);

      const promise = request.block();
      setTimeout(() => request.release('resource'), 100);

      const result = await promise;
      eq(result, 'resource');
    });
  });

});
