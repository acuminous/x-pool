const { describe, it, afterEach } = require('zunit');
const { deepStrictEqual: eq, rejects, throws, fail } = require('node:assert');
const Repository = require('../lib/Repository');
const { XPoolError } = require('..');

describe('Repository', () => {

  it('should not extend beyond max size', async () => {
    const repository = new Repository({ maxPoolSize: 1 });
    await repository.extend();

    throws(() => repository.extend(), (error) => {
      eq(error.message, 'XPool has encountered an error. Please report this via https://github.com/acuminous/x-pool/issues');
      eq(error.code, XPoolError.MAX_POOL_SIZE_EXCEEDED);
      eq(error.isXPoolError, true);
      eq(error.cause.message, 'Cannot extend beyond the maximum pool size of 1');
      return true;
    });
  });

});
