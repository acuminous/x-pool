const { bugs } = require('../package.json');

class XPoolError extends Error {

  static MAX_POOL_SIZE_EXCEEDED = Symbol('XPOOL_ERR_MAX_POOL_SIZE_EXCEEDED');
  static INVALID_OPERATION = Symbol('XPOOL_ERR_INVALID_OPERATION');

  static maxPoolSizeExceeded(message, details) {
    return new XPoolError(XPoolError.MAX_POOL_SIZE_EXCEEDED, message, details);
  }

  static invalidOperation(message, details) {
    return new XPoolError(XPoolError.INVALID_OPERATION, message, details);
  }

  constructor(code, message, details) {
    const cause = new Error(message, details);
    super(`XPool has encountered an error. Please report this via ${bugs.url}`, { code, cause });
  }

  get isXPoolError() {
    return true;
  }
}

module.exports = XPoolError;