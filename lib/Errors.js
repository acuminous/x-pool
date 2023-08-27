const pkg = require('./package');

class XPoolError extends Error {
  static code = 'ERR_X-POOL_ERROR';

  constructor(message, options) {
    super(message, options);
    this.code = this.constructor.code;
  }
}

class Bug extends XPoolError {
  constructor(message, options) {
    super(`${message}. Please submit a bug report via ${pkg.issues}`, options);
  }
}

class ConfigurationError extends XPoolError {
  static code = 'ERR_X-POOL_CONFIGURATION_ERROR';

  constructor(message, options) {
    super(`${message}. Please read the documentation at ${pkg.homepage}`, options);
  }
}

class OperationTimedout extends XPoolError {
  static code = 'ERR_X-POOL_OPERATION_TIMEDOUT';
}

class OperationAborted extends XPoolError {
  static code = 'ERR_X-POOL_OPERATION_ABORTED';
}

class PoolNotRunning extends XPoolError {
  static code = 'ERR_X-POOL_NOT_RUNNING';
}

class MaxQueueDepthExceeded extends XPoolError {
  static code = 'ERR_X-POOL_MAX_QUEUE_DEPTH_EXCEEDED';
}

class OutOfBoundsError extends Bug {
  static code = 'ERR_X-POOL_OUT_OF_BOUNDS';
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
  OperationAborted,
  OutOfBoundsError,
  PoolNotRunning,
  MaxQueueDepthExceeded,
  ResourceCreationFailed,
  ResourceValidationFailed,
  ResourceDestructionFailed,
};
