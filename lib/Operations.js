const { runInContext, getContextId } = require('./context');

const DEFAULT_MESSAGES = {
  notice: ({ contextId, text }) => `[${contextId}] ${text}`,
  error: ({ contextId, err }) => `[${contextId}] ${err.message}`,
};

class XPoolEvent {
  static code = 'X-POOL_EVENT';
}

class XPoolOperation {

  static STARTED = 'X-POOL_OPERATION_STARTED';

  static NOTICE = 'X-POOL_OPERATION_NOTICE';

  static SUCCEEDED = 'X-POOL_OPERATION_SUCCEEDED';

  static FAILED = 'X-POOL_OPERATION_FAILED';

  constructor(pool, messages = {}) {
    this._pool = pool;
    this._messages = { ...DEFAULT_MESSAGES, ...messages };
    this._ended = false;
  }

  async run(fn) {
    return runInContext(async () => {
      this.start();
      const before = Date.now();
      const result = await fn(this);
      const after = Date.now();
      this.succeeded(after - before);
      return result;
    });
  }

  start() {
    if (!this._messages.started) return;
    const contextId = getContextId();
    const code = this.constructor.STARTED;
    const message = this._messages.started({ contextId });
    this._emit(code, { code, message });
  }

  notice(text) {
    const contextId = getContextId();
    const code = this.constructor.NOTICE;
    const message = this._messages.notice({ contextId, text });
    this._emit(code, { code, message });
    return this;
  }

  succeeded(duration) {
    if (!this._messages.succeeded || this._ended) return;
    const contextId = getContextId();
    const code = this.constructor.SUCCEEDED;
    const message = this._messages.succeeded({ contextId, duration });
    this._emit(code, { code, message, duration });
    return this;
  }

  error(err) {
    const contextId = getContextId();
    const code = this.constructor.FAILED;
    const message = this._messages.error({ contextId, err });
    this._emit(code, { code, message });
    return this;
  }

  end() {
    this._ended = true;
  }

  _emit(code, payload) {
    this._pool.emit(code, payload) || this._pool.emit(XPoolEvent.code, payload);
  }
}

class InitialisePoolOperation extends XPoolOperation {
  static STARTED = 'X-POOL_INITIALISE_POOL_STARTED';

  static NOTICE = 'X-POOL_INITIALISE_POOL_NOTICE';

  static SUCCEEDED = 'X-POOL_INITIALISE_POOL_SUCCEEDED';

  static FAILED = 'X-POOL_INITIALISE_POOL_FAILED';

  constructor(pool, { initialSize }) {
    super(pool, {
      started: ({ contextId }) => `[${contextId}] Initialising pool with ${initialSize} resource(s)`,
      succeeded: ({ contextId, duration }) => `[${contextId}] Initialised pool with ${initialSize} resource(s) in ${duration}ms`,
    });
  }
}

class ShutdownPoolOperation extends XPoolOperation {
  static STARTED = 'X-POOL_SHUTDOWN_POOL_STARTED';

  static NOTICE = 'X-POOL_SHUTDOWN_POOL_NOTICE';

  static SUCCEEDED = 'X-POOL_SHUTDOWN_POOL_SUCCEEDED';

  static FAILED = 'X-POOL_SHUTDOWN_POOL_FAILED';

  constructor(pool) {
    super(pool, {
      started: ({ contextId }) => `[${contextId}] Shutting down pool`,
      succeeded: ({ contextId, duration }) => `[${contextId}] Shutdown pool in ${duration}ms`,
    });
  }
}

class AcquireResourceOperation extends XPoolOperation {
  static STARTED = 'X-POOL_ACQUIRE_RESOURCE_STARTED';

  static NOTICE = 'X-POOL_ACQUIRE_RESOURCE_NOTICE';

  static SUCCEEDED = 'X-POOL_ACQUIRE_RESOURCE_SUCCEEDED';

  static FAILED = 'X-POOL_ACQUIRE_RESOURCE_FAILED';

  constructor(pool) {
    super(pool, {
      started: ({ contextId }) => `[${contextId}] Acquiring resource`,
      succeeded: ({ contextId, duration }) => `[${contextId}] Acquired resource in ${duration}ms`,
    });
  }
}

class CreateResourceOperation extends XPoolOperation {
  static STARTED = 'X-POOL_CREATE_RESOURCE_STARTED';

  static NOTICE = 'X-POOL_CREATE_RESOURCE_NOTICE';

  static SUCCEEDED = 'X-POOL_CREATE_RESOURCE_SUCCEEDED';

  static FAILED = 'X-POOL_CREATE_RESOURCE_FAILED';

  constructor(pool) {
    super(pool, {
      started: ({ contextId }) => `[${contextId}] Creating resource`,
      succeeded: ({ contextId, duration }) => `[${contextId}] Created resource in ${duration}ms`,
    });
  }
}

class ValidateResourceOperation extends XPoolOperation {
  static STARTED = 'X-POOL_VALIDATE_RESOURCE_STARTED';

  static NOTICE = 'X-POOL_VALIDATE_RESOURCE_NOTICE';

  static SUCCEEDED = 'X-POOL_VALIDATE_RESOURCE_SUCCEEDED';

  static FAILED = 'X-POOL_VALIDATE_RESOURCE_FAILED';

  constructor(pool) {
    super(pool, {
      started: ({ contextId }) => `[${contextId}] Validating resource`,
      succeeded: ({ contextId, duration }) => `[${contextId}] Validated resource in ${duration}ms`,
    });
  }
}

class ReleaseResourceOperation extends XPoolOperation {
  static STARTED = 'X-POOL_RELEASE_RESOURCE_STARTED';

  static NOTICE = 'X-POOL_RELEASE_RESOURCE_NOTICE';

  static SUCCEEDED = 'X-POOL_RELEASE_RESOURCE_SUCCEEDED';

  static FAILED = 'X-POOL_RELEASE_RESOURCE_FAILED';

  constructor(pool) {
    super(pool, {
      started: ({ contextId }) => `[${contextId}] Releasing resource`,
      succeeded: ({ contextId, duration }) => `[${contextId}] Released resource in ${duration}ms`,
    });
  }
}

class WithResourceOperation extends XPoolOperation {
  static STARTED = 'X-POOL_WITH_RESOURCE_STARTED';

  static NOTICE = 'X-POOL_WITH_RESOURCE_NOTICE';

  static SUCCEEDED = 'X-POOL_WITH_RESOURCE_SUCCEEDED';

  static FAILED = 'X-POOL_WITH_RESOURCE_FAILED';

  constructor(pool) {
    super(pool, {
      started: ({ contextId }) => `[${contextId}] Using resource`,
      succeeded: ({ contextId, duration }) => `[${contextId}] Used resource in ${duration}ms`,
    });
  }
}

class DestroyResourceOperation extends XPoolOperation {
  static STARTED = 'X-POOL_DESTROY_RESOURCE_STARTED';

  static NOTICE = 'X-POOL_DESTROY_RESOURCE_NOTICE';

  static SUCCEEDED = 'X-POOL_DESTROY_RESOURCE_SUCCEEDED';

  static FAILED = 'X-POOL_DESTROY_RESOURCE_FAILED';

  constructor(pool) {
    super(pool, {
      started: ({ contextId }) => `[${contextId}] Destroying resource`,
      succeeded: ({ contextId, duration }) => `[${contextId}] Destroyed resource in ${duration}ms`,
    });
  }
}

class EvictBadResourcesOperation extends XPoolOperation {
  static STARTED = 'X-POOL_EVICT_BAD_RESOURCES_STARTED';

  static NOTICE = 'X-POOL_EVICT_BAD_RESOURCES_NOTICE';

  static SUCCEEDED = 'X-POOL_EVICT_BAD_RESOURCES_SUCCEEDED';

  static FAILED = 'X-POOL_EVICT_BAD_RESOURCES_FAILED';

  constructor(pool, { bad }) {
    super(pool, {
      started: ({ contextId }) => `[${contextId}] Destroying ${bad} bad resource(s)`,
      succeeded: ({ contextId, duration }) => `[${contextId}] Destroyed ${bad} bad resource(s) in ${duration}ms`,
    });
  }
}

class DestroySpareResourcesOperation extends XPoolOperation {
  static STARTED = 'X-POOL_DESTROY_SPARE_RESOURCES_STARTED';

  static NOTICE = 'X-POOL_DESTROY_SPARE_RESOURCES_NOTICE';

  static SUCCEEDED = 'X-POOL_DESTROY_SPARE_RESOURCES_SUCCEEDED';

  static FAILED = 'X-POOL_DESTROY_SPARE_RESOURCES_FAILED';

  constructor(pool, { spare }) {
    super(pool, {
      started: ({ contextId }) => `[${contextId}] Destroying ${spare} spare resource(s)`,
      succeeded: ({ contextId, duration }) => `[${contextId}] Destroyed ${spare} spare resource(s) in ${duration}ms`,
    });
  }
}

module.exports = {
  XPoolEvent,
  XPoolOperation,
  InitialisePoolOperation,
  ShutdownPoolOperation,
  AcquireResourceOperation,
  CreateResourceOperation,
  ValidateResourceOperation,
  ReleaseResourceOperation,
  WithResourceOperation,
  DestroyResourceOperation,
  EvictBadResourcesOperation,
  DestroySpareResourcesOperation,
};
