const ValidateOptions = {
  ALWAYS_VALIDATE: Symbol('ALWAYS_VALIDATE'),
  VALIDATE_NEW: Symbol('VALIDATE_NEW'),
  VALIDATE_IDLE: Symbol('VALIDATE_IDLE'),
  NEVER_VALIDATE: Symbol('NEVER_VALIDATE'),
};

const ResetOptions = {
  ALWAYS_RESET: Symbol('ALWAYS_RESET'),
  NEVER_RESET: Symbol('NEVER_RESET'),
};

const defaults = {
  minPoolSize: 0,
  maxPoolSize: Infinity,
  minIdleResources: 0,
  maxQueueSize: Infinity,
  maxConcurrency: 5,
  startTimeout: 5000,
  stopTimeout: 5000,
  acquireTimeout: 5000,
  createTimeout: 1000,
  validateTimeout: 1000,
  resetTimeout: 1000,
  destroyTimeout: 1000,
  backoffInitialValue: 100,
  backoffFactor: 2,
  backoffMaxValue: 1000,
  validate: ValidateOptions.NEVER_VALIDATE,
  reset: ResetOptions.NEVER_RESET,
};

function symbolFor(options, key) {
  return options[key?.toUpperCase()];
}

function applyDefaults(overrides = {}) {
  return {
    ...defaults,
    ...overrides,
    validate: symbolFor(ValidateOptions, overrides.validate),
    reset: symbolFor(ResetOptions, overrides.reset),
  };
}

module.exports = {
  applyDefaults,
  ValidateOptions,
  ResetOptions,
};
