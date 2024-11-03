const { describe, it } = require('zunit');
const { deepStrictEqual: eq, fail } = require('node:assert');

const Queue = require('../lib/Queue');
const noop = () => {};

describe('Queue', () => {

  describe('add', () => {
    it('should queue requests', () => {
      const queue = new Queue();
      queue.add(1, noop);
      eq(queue.stats(), { queued: 1, dispatched: 0 });
    });
  });

  describe('check', () => {

    it('should tolerate checking an empty queue', (t, done) => {
      const queue = new Queue();
      queue.check();
      done();
    })

    it('should yield the next available request', (t, done) => {
      const queue = new Queue();
      queue.add(1, (request) => {
        eq(request.id, 1);
        done();
      });

      queue.check();
    });

    it('should skip previously delivered requests', (t, done) => {
      const queue = new Queue();
      queue.add(1, (request) => {
        eq(request.id, 1);
      });
      queue.add(2, (request) => {
        eq(request.id, 2);
        done();
      });

      queue.check();
      queue.check();
    });

    it('should yield requeued requests', (t, done) => {
      const queue = new Queue();

      let attempts = 0;
      queue.add(1, (request) => {
        eq(request.id, 1);
        if (++attempts === 1) return queue.requeue(request);
        done();
      });
      queue.check();
      queue.check();
    });

    it('should not yield a request when there are none available', (t, done) => {
      const queue = new Queue();

      let attempts = 0;
      queue.add(1, (request) => {
        eq(request.id, 1);
        attempts++;
        eq(attempts, 1);
      });

      queue.check();
      queue.check();
      done();
    });
  });

  describe('remove', () => {
    it('should remove the given request', (t, done) => {
      const queue = new Queue();

      queue.add(1, (request) => {
        queue.remove(request);
        eq(queue.stats(), { queued: 0, dispatched: 0 });
        done();
      });

      queue.check();
    })
  })

  describe('stats', () => {
    it('should report stats for empty queue', () => {
      const queue = new Queue();
      eq(queue.stats(), { queued: 0, dispatched: 0 });
    });

    it('should report stats for a populated queue', () => {
      const queue = new Queue();
      queue.add(1, noop);
      queue.add(2, noop);
      eq(queue.stats(), { queued: 2, dispatched: 0 });
    });

    it('should report active requests', () => {
      const queue = new Queue();
      queue.add(1, noop);
      queue.add(2, noop);
      queue.check();
      eq(queue.stats(), { queued: 1, dispatched: 1 });
    });
  })

});
