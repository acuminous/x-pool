const XPoolError = require('./XPoolError');

class MaxPoolSizeExceeded extends XPoolError {
  constructor(message, details) {
    super(XPoolError.MAX_POOL_SIZE_EXCEEDED, message, details);
  }
}

module.exports = MaxPoolSizeExceeded;
