class XPoolError extends Error {
  static code = 'ERR_X-POOL_ERROR';

  constructor(message, options) {
    super(message, options);
    this.code = this.constructor.code;
  }
}

class ConfigurationError extends XPoolError {
  static code = 'ERR_X-POOL_CONFIGURATION_ERROR';

  constructor(message, options) {
    super(`${message}. Please read the documentation at https://github.com/acuminous/x-pool`, options);
  }
}

class OperationTimedout extends XPoolError {
  static code = 'ERR_X-POOL_OPERATION_TIMEDOUT';
}

class ResourceCreationFailed extends XPoolError {
  static code = 'ERR_X-POOL_RESOURCE_CREATION_FAILED';
}

class ResourceValidationFailed extends XPoolError {
  static code = 'ERR_X-POOL_RESOURCE_VALIDATION_FAILED';
}

module.exports = {
  XPoolError,
  ConfigurationError,
  OperationTimedout,
  ResourceCreationFailed,
  ResourceValidationFailed,
};
