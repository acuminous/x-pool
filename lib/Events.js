class Events {
	static RESOURCE_CREATED = Symbol('resource_created');
	static RESOURCE_RELEASED = Symbol('resource_released');
	static RESOURCE_CREATION_ERROR = Symbol('resource_creation_error');
	static RESOURCE_DESTROYED = Symbol('resource_destroyed');
	static RESOURCE_SEGREGATED = Symbol('resource_segregated');
	static RESOURCE_EVICTED = Symbol('resource_evicted');
}

module.exports = Events;
