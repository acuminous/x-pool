class Events {
  static RESOURCE_CREATED = Symbol('resource_created');
  static RESOURCE_CREATION_ERROR = Symbol('resource_creation_error');
  static RESOURCE_CREATION_TIMEOUT = Symbol('resource_creation_timeout');
  static RESOURCE_ACQUIRED = Symbol('resource_acquired');
  static RESOURCE_RELEASED = Symbol('resource_released');
  static RESOURCE_DESTROYED = Symbol('resource_destroyed');
  static RESOURCE_DESTRUCTION_ERROR = Symbol('resource_destruction_error');
  static RESOURCE_DESTRUCTION_TIMEOUT = Symbol('resource_destruction_timeout');
  static RESOURCE_SEGREGATED = Symbol('resource_segregated');
}

module.exports = Events;
