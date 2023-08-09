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
    super(`${message}. Please read the documentation at https://acuminous.github.io/x-pool`, options);
  }
}

class OperationTimedout extends XPoolError {
  static code = 'ERR_X-POOL_OPERATION_TIMEDOUT';
}

class OperationFailed extends XPoolError {
  static code = 'ERR_X-POOL_OPERATION_FAILED';
}

class ResourceCreationFailed extends XPoolError {
  static code = 'ERR_X-POOL_RESOURCE_CREATION_FAILED';
}

class ResourceValidationFailed extends XPoolError {
  static code = 'ERR_X-POOL_RESOURCE_VALIDATION_FAILED';
}

class ResourceDestructionFailed extends XPoolError {
  static code = 'ERR_X-POOL_RESOURCE_DESTRUCTION_FAILED';
}

module.exports = {
  XPoolError,
  ConfigurationError,
  OperationTimedout,
  OperationFailed,
  ResourceCreationFailed,
  ResourceValidationFailed,
  ResourceDestructionFailed,
};
