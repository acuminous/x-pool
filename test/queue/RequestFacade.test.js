const { describe, it } = require('zunit');
const { deepStrictEqual: eq } = require('node:assert');
const { takesAtLeast: tmin } = require('../lib/custom-assertions');
const RequestFactory = require('../../lib/queue/RequestFactory');
const RequestFacade = require('../../lib/queue/RequestFacade');

const noop = () => {};

describe('RequestFacade', () => {

  it('should report the request id', () => {
    const factory = createRequestFactory();
    const request = new RequestFacade('1234', noop, factory);

    eq(request.id, '1234');
  });

  it('should default to an unqueued request', () => {
    const factory = createRequestFactory();
    const request = new RequestFacade('1234', noop, factory);

    eq(request.state, 'unqueued');
  });

  describe('queue', () => {
    it('should queue unqueued requests', () => {
      const queued = [];
      const dispatched = [];
      const factory = createRequestFactory({ queued, dispatched });
      const request = new RequestFacade('1234', noop, factory)

      request.queue();

      eq(request.state, 'queued');
      eq(queued, [request]);
      eq(dispatched, []);
    });
  });

  describe('dispatch', () => {
    it('should dispatch queued requests', () => {
      const queued = [];
      const dispatched = [];
      const factory = createRequestFactory({ queued, dispatched });
      const request = new RequestFacade('1234', noop, factory).queue();

      request.dispatch();

      eq(request.state, 'dispatched');
      eq(queued, []);
      eq(dispatched, [request]);
    });

    it('should execute the handler', (t, done) => {
      const handler = (request) => {
        eq(request.id, '1234')
        done();
      }
      const factory = createRequestFactory();
      const request = new RequestFacade('1234', handler, factory).queue();

      request.dispatch();
    });
  });

  describe('abort', () => {
    it('should abort queued requests', () => {
      const queued = [];
      const dispatched = [];
      const factory = createRequestFactory({ queued, dispatched });
      const request = new RequestFacade('1234', noop, factory).queue();

      request.abort();

      eq(request.state, 'aborted');
      eq(queued, []);
      eq(dispatched, []);
    });

    it('should abort dispatched requests', () => {
      const queued = [];
      const dispatched = [];
      const factory = createRequestFactory({ queued, dispatched });
      const request = new RequestFacade('1234', noop, factory).queue();

      request.dispatch()
      request.abort();

      eq(request.state, 'aborted');
      eq(queued, []);
      eq(dispatched, []);
    });
  });

  describe('block', () => {
    it('should block until released', async () => {
      const factory = createRequestFactory();
      const request = new RequestFacade('1234', noop, factory).queue();

      const promise = request.block();
      setTimeout(() => request.release(), 100);

      await tmin(async () => {
        await promise;
      }, 100)
    });
  });

  describe('release', () => {
    it('should yield a resource', async () => {
      const factory = createRequestFactory();
      const request = new RequestFacade('1234', noop, factory).queue();

      const promise = request.block();
      request.release('resource');

      const result = await promise;
      eq(result, 'resource');
    });
  });
});

function createRequestFactory(overrides) {
  const defaults = { queued: [], dispatched: [] };
  const { queued, dispatched } = { ...defaults, ...overrides };
  return new RequestFactory(queued, dispatched);
}
