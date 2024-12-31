const { bugs } = require('../../package.json');

class XPoolError extends Error {

  static MAX_POOL_SIZE_EXCEEDED = Symbol('XPOOL_ERROR_MAX_POOL_SIZE_EXCEEDED');
  static INVALID_OPERATION = Symbol('XPOOL_ERROR_INVALID_OPERATION');

  constructor(code, message, details) {
    const cause = new Error(message, details);
    super(`XPool has encountered an error. Please report this via ${bugs.url}`, { code, cause });
  }

  get isXPoolError() {
    return true;
  }
}

module.exports = XPoolError;
