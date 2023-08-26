# X-Pool

[![Node.js CI](https://github.com/acuminous/x-pool/workflows/Node.js%20CI/badge.svg)](https://github.com/acuminous/x-pool/actions?query=workflow%3A%22Node.js+CI%22)
[![Code Climate](https://codeclimate.com/github/acuminous/x-pool/badges/gpa.svg)](https://codeclimate.com/github/acuminous/x-pool)
[![Test Coverage](https://codeclimate.com/github/acuminous/x-pool/badges/coverage.svg)](https://codeclimate.com/github/acuminous/x-pool/coverage)

X-Pool is a generic resource pool library for Node.js inspired by [generic-pool/node-pool](https://github.com/coopernurse/node-pool) which sadly has some [long standing and serious bugs](https://github.com/coopernurse/node-pool/issues/197). It offers a slightly different interface than generic-pool, so please refer to the [migrating guide](#migrating-from-generic-pool) section if you are planning to migrate.

## TL;DR

```js
const { Pool } = require("x-pool");
const CustomResourceFactory = require("./CustomResourceFactory");
const factory = new CustomResourceFactory();
const pool = new Pool({ factory, acquireTimeout: 5000, destroyTimeout: 5000 });

const resource = await pool.acquire();
try {
  // Do work
} finally {
  pool.release(resource);
}
```

## Index

<!-- no toc -->
- [Configuration Options](#configuration-options)
- [Custom Factories](#custom-factories)
- [Pool API](#pool-api)
  - [initialise](#initialise--promisevoid)
  - [acquire](#acquire--promiset)
  - [release](#releaseresource-t--void)
  - [with](#withresource--t--promise--promise)
  - [destroy](#destroy--void)
  - [evictBadResources](#evictbadresources--void)
  - [stats](#stats--poolstats)
  - [shutdown](#shutdown--promisevoid)
- [Resource Management](#resource-management)
- [Events](#events)
- [Errors](#errors)
- [Migrating from Generic Pool](#migrating-from-generic-pool)

## Configuration Options

| Name                 | Type    | Required | Default  | Notes                                                                                                                                                          |
| -------------------- | ------- | -------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| factory              | Factory | Y        |          | An instance of a resource factory.                                                                                                                             |
| minSize              | integer | N        | 0        | Sets the minimum pool size.                                                                                                                                    |
| maxSize              | integer | N        | Infinity | Sets the maximum pool size.                                                                                                                                    |
| maxQueueDepth        | integer | N        | Infinity | Sets the maximum acquire queue depth, which may be useful to constrain memory usage during exceptionally high peaks. Only meaningful when maxSize is also set. |
| initialiseTimeout    | integer | N        |          | The number of milliseconds the pool will wait to initialise. If unset the pool will wait undefinitely.                                                         |
| acquireTimeout       | integer | Y        |          | The number of milliseconds the pool will wait to acquire a resource before rejecting.                                                                          |
| acquireRetryInterval | integer | N        | 100      | The number of milliseconds the pool will wait before retrying resource acquition after a failure.                                                              |
| destroyTimeout       | integer | Y        |          | The number of milliseconds the pool will wait for the factory to destroy a resource.                                                                           |
| shutdownTimeout      | integer | N        |          | The number of milliseconds the pool will wait to shutdown. If unset the pool will wait undefinitely.                                                           |
| revalidateInterval   | integer | N        |          | The number of milliseconds the pool will wait after an idle resource's creation or release before revalidating it.                                             |
| revalidateTimeout    | integer | Y        |          | The number of milliseconds the pool will wait for the factory to revalidate a resource.                                                                        |
| evictionThreshold    | integer | N        |          | The number of milliseconds of idle time before the resource becomes eligible for eviction. If unset eviction will be disabled.                                 |

#### Errors

| Code                                 | Notes                                                       |
| ------------------------------------ | ----------------------------------------------------------- |
| ERR_X&#8209;POOL_CONFIGURATION_ERROR | The pool was passed an invalid set of configuration options |

## Custom Factories

A factory is a user implemented object which must expose the following three methods:

### create(pool: Pool) : Promise&lt;T&gt;

Must resolve with a new resource or reject if the resource could not be created.

### validate(resource: T) : Promise&lt;void&gt;

Must resolve if the resource is confirmed to be working or reject if the resource is found to be broken. If you don't want to validate resources then implement an empty function.

### destroy(resource: T) : Promise&lt;void&gt;

Must resolve after destroying the supplied resource or reject if the resource could not be destroyed.

### Example

```js
const db = require("db");

module.exports = class DatabaseFactory {
  constructor(options) {
    this._options = options;
  }

  async create(pool) {
    return db.connect(this._options);
  }

  async validate(client) {
    await client.query("SELECT 1");
  }

  async destroy(client) {
    return client.close();
  }
};
```

## Pool API

### initialise() : Promise&lt;void&gt;

```js
const resource = await pool.initialise();
```

Initialisise the pool, only yielding after the minimum number of resources have been created or if the initialiseTimeout is exceeded. You do not need to wait for the pool to initialise, however it is recommented you do so as to ensure your factory is correctly configured and has access to the required systems.

### acquire() : Promise&lt;T&gt;

```js
const resource = await pool.acquire();
```

Acquires and validates a resource from the pool, creating one if necessary as long as the optional maximum pool size has not been reached. If the create or validate fails acquition will be retried after the `acquireRetryInterval`. If the pool is exhausted this method will block until a resource becomes available or the `acquireTimeout` is exceeded. If the `acquireTimeout` is exceed the method will reject. Resources created after the timeout is exceeded will be added to the pool, unless it is already at capacity, in which case they will be destroyed.

There are equally strong arguments to re-issue the most recently used reosurce as as the least recently used. X-Pool deliberately offers no guarantees of the order in which idle resources are re-issued. Instead provides the option of keeping the resources warm by revalidating idle resources reguarly via the `revalidateInterval` configuration option.

#### Errors

| Code                                      | Notes                                                                       |
| ----------------------------------------- | --------------------------------------------------------------------------- |
| ERR_X&#8209;POOL_OPERATION_TIMEDOUT       | The acquire timeout was exceeded                                            |
| ERR_X&#8209;POOL_NOT_RUNNING              | The resource could not be acquired (e.g. because the pool is shutting down) |
| ERR_X&#8209;POOL_MAX_QUEUE_DEPTH_EXCEEDED | The maximum acquire queue depth was exceeded                                |

### release(resource: T) : void

```js
pool.release(resource);
```

Returns a resource to the pool. If the resource is not managed it will be discarded without error.

### with((resource : T) => Promise&lt;any&gt;) : Promise&lt;any&gt;

```js
const result = await pool.with(async (resource) => {
  // do something with the resource
});
```

Acquires a resource, passes it to the supplied function, and releases it when the function ends

#### Errors

| Code                                | Notes                                                                       |
| ----------------------------------- | --------------------------------------------------------------------------- |
| ERR_X&#8209;POOL_OPERATION_TIMEDOUT | The acquire timeout was exceeded                                            |
| ERR_X&#8209;POOL_NOT_RUNNING        | The resource could not be acquired (e.g. because the pool is shutting down) |

### destroy() : void

```js
pool.destroy(resource);
```

Instructs the pool to destroy a resource instead of returning it to the pool. The act of destroying a resource is performed in the background so the destroy method returns instantly. If the destroy operation fails or times out the resource still takes up space within the pool, although it will never be re-issued. Where the pool has been configured with a maximum size, this could lead to resource contention impacting performance. In extreme cases it could even lead to all the pool becoming unusable. If you are concerned about this possibility then you can listen for the pool `ERR_X&#8209;POOL_RESOURCE_DESTROY_FAILED` and `ERR_X&#8209;POOL_OPERATION_TIMEDOUT` events call `pool.evictBadResources()` when they occur.

### evictBadResources() : void

```js
pool.evictBadResources();
```

Evicts resources that failed to be destroyed.

### stats() : PoolStats

```js
const { size, idle, pending, queued, acquired, available, bad } = pool.stats();
```

Returns the following of statistics about the pool

| Name       | Type    | Notes                                                                      |
| ---------- | ------- | -------------------------------------------------------------------------- |
| queued     | integer | The number of queued acquisition requests                                  |
| acquiring  | integer | The number of resources in the process of being acquired                   |
| acquired   | integer | The number of resources currently in use                                   |
| idle       | integer | The number of resources currently idling in the pool                       |
| destroying | integer | The nubmer of resources currently being destroyed                          |
| bad        | integer | The number of resourses which failed to be destroyed                       |
| size       | integer | The current pool size (idle + acquired + bad)                              |
| available  | integer | The number of resources available from the pool (maxSize - acquired - bad) |
| peak       | integer | The peak pool size                                                         |

### shutdown() : Promise&lt;void&gt;

```js
await pool.shutdown();
```

Shuts down the pool. After calling shutdown any inflight acquisition requests will be allowed to continue but new requests will be rejected. Once there are no inflight requests the remaining idle resources will be destroyed. The method blocks until all resources have been destroyed or until the shutdownTimeout expires. Calling shutdown repeatedly will yield an error.

## Resource Management

### Revalidation

Idle resources sometimes benefit from being kept alive. You can enable this by specifying a `revalidateInterval` which will cause X-Pool to validate the resoure periodically while idling. If a resource fails validation is will be destroyed.

| Code                                        | Notes                                                                                          |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| ERR_X&#8209;POOL_OPERATION_TIMEDOUT         | The `revalidationTimeout` was exceeded                                                         |
| ERR_X&#8209;POOL_RESOURCE_VALIDATION_FAILED | The pool could not be shutdown, possibly because it is already in the process of shutting down |

### Eviction

You can configure the pool to shrink back to the `minSize` when it is not busy by specifying a `evictionThreshold` in milliseconds. Once a resource has been idle for longer than the evication threshold it may be destroyed.

#### Errors

| Code                                | Notes                                                                                          |
| ----------------------------------- | ---------------------------------------------------------------------------------------------- |
| ERR_X&#8209;POOL_OPERATION_TIMEDOUT | The `shutdownTimeout` was exceeded                                                             |
| ERR_X&#8209;POOL_NOT_RUNNING        | The pool could not be shutdown, possibly because it is already in the process of shutting down |

## Events

X-Pool uses the NodeJS EventEmitter to expose information about the pool internals. Each high level operation, e.g. initialise, acquire, release, etc. has a corresponding Operation class. When the operation runs, the Pool will emit events corresponding to the start of the operation, the success of the operation or the failure of the operation.
Some operations may emit additional events signifying an important state change within the pool. The potential events are as follows:

| Event                                  | Code                                         |
| -------------------------------------- | -------------------------------------------- |
| XPoolEvent                             | N/A the class is emitted                     |
| XPoolOperation                         | N/A the class is emitted                     |
| InitialisePoolOperation.${TYPE}        | X&#8209;POOL_INITIALISE_POOL_${TYPE}         |
| ShutdownPoolOperation.${TYPE}          | X&#8209;POOL_SHUTDOWN_POOL_${TYPE}           |
| AcquireResourceOperation.${TYPE}       | X&#8209;POOL_ACQUIRE_RESOURCE_${TYPE}        |
| CreateResourceOperation.${TYPE}        | X&#8209;POOL_CREATE_RESOURCE_${TYPE}         |
| ValidateResourceOperation.${TYPE}      | X&#8209;POOL_VALIDATE_RESOURCE_${TYPE}       |
| ReleaseResourceOperation.${TYPE}       | X&#8209;POOL_RELEASE_RESOURCE_${TYPE}        |
| WithResourceOperation.${TYPE}          | X&#8209;POOL_WITH_RESOURCE_${TYPE}           |
| DestroyResourceOperation.${TYPE}       | X&#8209;POOL_DESTROY_RESOURCE_${TYPE}        |
| EvictBadResourcesOperation.${TYPE}     | X&#8209;POOL_EVICT_BAD_RESOURCES_${TYPE}     |
| DestroySpareResourcesOperation.${TYPE} | X&#8209;POOL_DESTROY_SPARE_RESOURCES_${TYPE} |

Where TYPE can be one of `STARTED`, `NOTICE`, `SUCCEEDED` or `FAILED`.

- All `STARTED` events include a `code` and `message`.
- All `NOTICE` events include a `code` and `message`.
- All `SUCCEEDED` events include a `code`, `message` and `duration`.
- All `FAILED` events include a `code`, `message` and `err`.

 You can write code to listen to for these events as follows:

```js
const { Operations } = require("x-pool");
const { CreateResourceOperation, XPoolEvent, XPoolError } = Operations;

pool.on(CreateResourceOperation.SUCCEEDED, ({ code, message, duration }) =&gt; {
  // Handle the Create Resource operation succeeded event in a specific way
});
pool.on(CreateResourceOperation.FAILED, ({ code, message, err }) =&gt; {
  // Handle the Create Resource operation error event in a specific way
});
pool.on(XPoolError, ({ code, message, err }) =&gt; {
  // Handle all error events in a general way
});
pool.on(XPoolEvent, (event) =&gt; {
  // Handle all events in a general way
});
```

## Errors
All errors rejectect or emitted by XPool have a code. If the error wraps a factory error, this will be available via the `cause` property. Potential errors are...

| Error                     | Code                                         |
| ------------------------- | -------------------------------------------- |
| ConfigurationError        | ERR_X&#8209;POOL_CONFIGURATION_ERROR         |
| OperationTimedout         | ERR_X&#8209;POOL_OPERATION_TIMEDOUT          |
| PoolNotRunning            | ERR_X&#8209;POOL_NOT_RUNNING                 |
| MaxQueueDepthExceeded     | ERR_X&#8209;POOL_MAX_QUEUE_DEPTH_EXCEEDED    |
| ResourceCreationFailed    | ERR_X&#8209;POOL_RESOURCE_CREATION_FAILED    |
| ResourceValidationFailed  | ERR_X&#8209;POOL_RESOURCE_VALIDATION_FAILED  |
| ResourceDestructionFailed | ERR_X&#8209;POOL_RESOURCE_DESTRUCTION_FAILED |

## Migrating from Generic Pool

Migrating from [generic-pool](https://github.com/coopernurse/node-pool) is relatively straightforward, however there are multiple differences you need to be aware of.

### Configuration Options

| Generic Pool              | X-Pool         | Notes                                                                                                                 |
| ------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------- |
| max                       | maxSize        |                                                                                                                       |
| min                       | minSize        | X-Pool does not silently adjust the min pool size when it exceeds the max pool size                                   |
| maxWaitingClients         | maxQueueDepth  |                                                                                                                       |
| testOnBorrow              | Not Supported  | Use an empty `factory.validate` method instead.                                                                       |
| acquireTimeoutMillis      | acquireTimeout | This option is mandatory with X-Pool.                                                                                 |
| destroyTimeoutMillis      | destroyTimeout | This option is mandatory with X-Pool.                                                                                 |
| fifo                      | Not Supported  | Use the revalidateInterval to keep the resources alive instead.                                                       |
| priorityRange             | Not Supported  | We will consider adding this feature if needed.                                                                       |
| autostart                 | autoStart      |                                                                                                                       |
| evictionRunIntervalMillis | Not Supported  | X-Pool's eviction works by adding event handlers to each resource rather than looping through the idle resource list. |
| numTestsPerEvictionRun    | Not Supported  | X-Pool's eviction works by adding event handlers to each resource rather than looping through the idle resource list. |
| softIdleTimeoutMillis     | Not Supported  | Use the evictionThreshold option instead.                                                                             |
| idleTimeoutMillis         | Not Supported  | Use the evictionThreshold option instead.                                                                             |
| Promise                   | Not Supported  | X-Pool only supports native promises.                                                                                 |

### API

X-Pool does not currently support priorities

#### acquire(priority? : number) : Promise&lt;T&gt;
acquire() : Promise&lt;T&gt;

X-Pool does not currently support priorities

#### isBorrowedResource() : boolean
This method is not necessary since returning an unmanaged resource to the pool will have no effect.

#### release(resource : T) : Promise&lt;void&gt;
release(resource : T) : void |

Releasing resources is a synchronous operation hence we do not return a promise.

#### destroy(resource : T) : Promise&lt;void&gt;
destroy(resource : T) : void

Resources are destroyed in the background so we do not return a promise.

#### start() : void
initialise() : Promise&lt;void&gt;

Resolves once the minimum number of resources have been added to the pool, or rejects if the optional `initialiseTimeout` is exceeded. You do not need to wait for the initialise method to resolve if you do not want to.

#### ready() : void
Await the initialise method or listen for the InitialisePoolOperation.SUCCEEDED event.

#### use((resource: T) => Promise&lt;any&gt;) : Promise&lt;any&gt;
with((resource: T) => Promise&lt;any&gt;) : Promise&lt;any&gt;

We will consider adding this feature if needed.

#### drain() : Promise&lt;void&gt;
shutdown() : Promise&lt;void&gt;

#### clear() : Promise&lt;void&gt; Not Supported
Not necessary with X-Pool

### Events

| Generic Pool            | X-Pool                          |
| ----------------------- | ------------------------------- |
| factoryCreateError      | CreateResourceOperation.FAILED  |
| factoryDestructionError | DestroyResourceOperation.FAILED |

### Pool Stats

| Generic Pool          | X-Pool                       |
| --------------------- | ---------------------------- |
| spareResourceCapacity | Not exposed via pool.stats() |
| size                  | size                         |
| available             | idle                         |
| borrowed              | acquired                     |
| pending               | queued + acquiring           |
| max                   | Not exposed via pool.stats() |
| min                   | Not exposed via pool.stats() |
