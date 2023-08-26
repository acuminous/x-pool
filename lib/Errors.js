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

class PoolNotRunning extends XPoolError {
  static code = 'ERR_X-POOL_NOT_RUNNING';
}

class MaxQueueDepthExceeded extends XPoolError {
  static code = 'ERR_X-POOL_MAX_QUEUE_DEPTH_EXCEEDED';
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
  PoolNotRunning,
  MaxQueueDepthExceeded,
  ResourceCreationFailed,
  ResourceValidationFailed,
  ResourceDestructionFailed,
};
