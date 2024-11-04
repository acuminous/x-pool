const { describe, it } = require('zunit');
const { deepStrictEqual: eq, fail } = require('node:assert');
const { takesAtLeast: tmin, takesAtMost: tmax } = require('../lib/custom-assertions');

const Queue = require('../../lib/queue/Queue');
const noop = () => {};

describe('Queue', () => {

  describe('add', () => {
    it('should queue requests', () => {
      const queue = new Queue();
      queue.add(1, noop);
      eq(queue.size, 1);
    });
  });

  describe('check', () => {

    it('should tolerate checking an empty queue', () => {
      const queue = new Queue();
      queue.check();
    })

    it('should dispatch the next available request', (t, done) => {
      const queue = new Queue();
      queue.add(1, (request) => {
        eq(request.id, 1);
        done();
      });

      queue.check();
    });

    it('should not dispatch previously delivered requests', (t, done) => {
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

    it('should dispatch requeued requests', (t, done) => {
      const queue = new Queue();

      let attempts = 0;
      queue.add(1, (request) => {
        eq(request.id, 1);
        if (++attempts === 2) return done();
        request.requeue();
        queue.check();
      });

      queue.check();
    });

    it('should dispatch requeued requests before queued requests', (t, done) => {
      const queue = new Queue();

      let attempts = 0;
      queue.add(1, (request) => {
        eq(request.id, 1);
        if (++attempts === 2) return done();
        request.requeue();
        queue.check();
      });
      queue.add(2, (request) => {
        fail('Queued request was dispatched before requeued request');
      });

      queue.check();
    });

    it('should not dispatch a request when the queue is empty', (t, done) => {
      const queue = new Queue();

      let attempts = 0;
      queue.add(1, (request) => {
        eq(request.id, 1);
        attempts++;
        eq(attempts, 1);
        queue.check();
        done();
      });

      queue.check();
    });
  });

  describe('drain', () => {
    it('should wait for queue to be drained', async () => {
      const queue = new Queue();
      queue.add(1, () => {});

      setTimeout(() => queue.check(), 100);

      await tmin(async () => {
        await queue.drain();
      }, 100)
    });

    it('should not wait for queue to be drained is already empty', async () => {
      const queue = new Queue();

      await tmax(async () => {
        await queue.drain();
      }, 10)
    });
  })

});
