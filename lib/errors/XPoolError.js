const { bugs } = require('../../package.json');

class XPoolError extends Error {

  static MAX_POOL_SIZE_EXCEEDED = Symbol('MAX_POOL_SIZE_EXCEEDED');
  static INVALID_OPERATION = Symbol('INVALID_OPERATION');

  constructor(code, message, details) {
    const cause = new Error(message, details);
    super(`XPool has encountered an error. Please report this via ${bugs.url}`, { cause });
    Object.assign(this, { code });
  }

  get isXPoolError() {
    return true;
  }
}

module.exports = XPoolError;
