const XPoolError = require('./XPoolError');

class InvalidOperation extends XPoolError {
  constructor(message, details) {
    super(XPoolError.INVALID_OPERATION, message, details);
  }
}

module.exports = InvalidOperation;
