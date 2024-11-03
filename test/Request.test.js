const { describe, it } = require('zunit');
const { deepStrictEqual: eq } = require('node:assert');
const Request = require('../lib/Request');

describe('Request', () => {

  describe('constructor', () => {
    it('should initialize with an id and handler', () => {

      const request = new Request('1234', () => {});

      eq(request.id, '1234');
    });
  });

  describe('queue', () => {
    it('should set the dispatched flat to false', () => {
      const request = new Request('1234', () => {});

      request.dispatch();
      request.queue();

      eq(request.isDispatched(), false);
    });
  });

  describe('dispatch', () => {
    it('should set the dispatched flat to true', () => {
      const request = new Request('1234', () => {});

      request.dispatch();

      eq(request.isDispatched(), true);
    });
  });

  describe('abort', () => {
    it('should set the aborted flag to true', () => {
      const request = new Request('1234', () => {});

      request.abort();

      eq(request.isAborted(), true);
    });

    it('should release the response latch', async () => {
      const request = new Request('1234', () => {});

      request.abort();

      await request.block();
    });
  });

  describe('block', () => {
    it('should block until released', async () => {
      const request = new Request('1234', () => {});

      const promise = request.block();
      setTimeout(() => request.release(), 100);

      await promise;
    });
  });

  describe('release', () => {
    it('should release the response latch with a resource', async () => {
      const request = new Request('1234', () => {});

      const promise = request.block();
      setTimeout(() => request.release('resource'), 100);

      const result = await promise;
      eq(result, 'resource');
    });
  });

});
