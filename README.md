# X-Pool

[![Node.js CI](https://github.com/acuminous/x-pool/workflows/Node.js%20CI/badge.svg)](https://github.com/acuminous/x-pool/actions?query=workflow%3A%22Node.js+CI%22)
[![Code Climate](https://codeclimate.com/github/acuminous/x-pool/badges/gpa.svg)](https://codeclimate.com/github/acuminous/x-pool)
[![Test Coverage](https://codeclimate.com/github/acuminous/x-pool/badges/coverage.svg)](https://codeclimate.com/github/acuminous/x-pool/coverage)

X-Pool is a generic resource pool library for Node.js inspired by [generic-pool/node-pool](https://github.com/coopernurse/node-pool) which sadly has some [long standing and serious bugs](https://github.com/coopernurse/node-pool/issues/197). It offers a slightly different interface than generic-pool, so please refer to the [#migrating-from-generic-pool] section if you are planning to migrate.

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

## Configuration Options

| Name                 | Type    | Required | Default  | Notes                                                                                                                          |
| -------------------- | ------- | -------- | -------- | ------------------------------------------------------------------------------------------------------------------------------ |
| factory              | Factory | Y        |          | An instance of a resource factory                                                                                              |
| minSize              | integer | N        | 0        | Specifies the minimum pool size.                                                                                               |
| maxSize              | integer | N        | Infinity | Specifies the maximum pool size.                                                                                               |
| initialiseTimeout    | integer | N        |          | The number of milliseconds the pool will wait to initialise. If unset the pool will wait undefinitely.                         |
| acquireTimeout       | integer | Y        |          | The number of milliseconds the pool will wait to acquire a resource before rejecting.                                          |
| acquireRetryInterval | integer | N        | 100      | The number of milliseconds the pool will wait before retrying resource acquition after a failure.                              |
| destroyTimeout       | integer | Y        |          | The number of milliseconds the pool will wait for the factory to destroy a resource.                                           |
| shutdownTimeout      | integer | N        |          | The number of milliseconds the pool will wait to shutdown. If unset the pool will wait undefinitely.                           |
| revalidateInterval   | integer | N        |          | The number of milliseconds the pool will wait after an idle resource's creation or release before revalidating it.             |
| revalidateTimeout    | integer | Y        |          | The number of milliseconds the pool will wait for the factory to revalidate a resource.                                        |
| evictionThreshold    | integer | N        |          | The number of milliseconds of idle time before the resource becomes eligible for eviction. If unset eviction will be disabled. |

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

Acquires and validates a resource from the pool, creating one if necessary as long as the optional maximum pool size has not been reached. If the create or validate fails acquition will be retried after the `acquireRetryInterval`. If the pool is exhausted this method will block until a resource becomes available or the `acquireTimeout` is exceeded. If the `acquireTimeout` is exceed the method will reject. Resources created after the timeout is exceeded will be added to the pool.

There are equally strong arguments to re-issue the most recently used reosurce as as the least recently used. X-Pool deliberately offers no guarantees of the order in which idle resources are re-issued, and instead provides the option of keeping the resources warm by revalidating idle resources reguarly via the `revalidateInterval` configuration option.

#### Errors

| Code                                | Notes                                                                       |
| ----------------------------------- | --------------------------------------------------------------------------- |
| ERR_X&#8209;POOL_OPERATION_TIMEDOUT | The acquire timeout was exceeded                                            |
| ERR_X&#8209;POOL_OPERATION_FAILED   | The resource could not be acquired (e.g. because the pool is shutting down) |

### release(resource: T) : void

```js
pool.release(resource);
```

Returns a resource to the pool. If the resource is not managed it will be discarded without error.

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

| Name      | Type    | Notes                                                                      |
| --------- | ------- | -------------------------------------------------------------------------- |
| size      | integer | The current pool size (idle + acquired + bad)                              |
| idle      | integer | The number of resources currently idling in the pool                       |
| queued    | integer | The number of queued acquisition requests                                  |
| pending   | integer | The number of resources in the process of being acquired                   |
| acquired  | integer | The number of resources currently in use                                   |
| bad       | integer | The number of resourses which failed to be destroyed                       |
| available | integer | The number of resources available from the pool (maxSize - acquired - bad) |

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
| ERR_X&#8209;POOL_OPERATION_FAILED   | The pool could not be shutdown, possibly because it is already in the process of shutting down |

## Error Events

Resources can break while idle. Resource creation / validation can fail after the request has timedout. Resource destruction always takes place in the background, and could also error. For this reason the Pool emits events so your application can keep tabs on what's going on under the hood. All error events are emitted first as a specific event, and if not explicitly handled, re-emitted as a generic event so that you can have a catch all handler if you chose. For example:

```js
const { Errors } = require("x-pool");
const { ResourceCreationFailed, XPoolError } = Errors;

pool.on(ResourceCreationFailed.code, (err) =&gt; {
  // Handle the resource creation failed error event in a specific way
});
pool.on(XPoolError.code, (err) =&gt; {
  // Handle all other error events in a general way
});
```

The potential events are as follows:

| Event                                        | Notes                                                                 |
| -------------------------------------------- | --------------------------------------------------------------------- |
| ERR_X&#8209;POOL_ERROR                       | Only emitted if one of the following events is not explicitly handled |
| ERR_X&#8209;POOL_RESOURCE_CREATION_FAILED    | The factory yielded an error while creating a resource                |
| ERR_X&#8209;POOL_RESOURCE_VALIDATION_FAILED  | The factory yielded an error while validating a resource              |
| ERR_X&#8209;POOL_RESOURCE_DESTRUCTION_FAILED | The factory yielded an error while destroying a resource              |
| ERR_X&#8209;POOL_OPERATION_TIMEDOUT          | The createResource timeout was exceeded while creating a resource     |

## Migrating from Generic Pool

Migrating from [generic-pool](https://github.com/coopernurse/node-pool) is relatively straightforward, however there are multiple differences you need to be aware of.

### Configuration Options

| Generic Pool              | X-Pool         | Notes                                                                                                                 |
| ------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------- |
| max                       | maxSize        |                                                                                                                       |
| min                       | minSize        |                                                                                                                       |
| maxWaitingClients         | Not Supported  | We suggest using the acquireTimeout option instead.                                                                   |
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

| Generic Pool                                   | X-Pool                             | Notes                                                                                                                                                                                                                      |
| ---------------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| acquire(priority? : number) : Promise&lt;T&gt; | acquire() : Promise&lt;T&gt;       | X-Pool does not currently support priorities                                                                                                                                                                               |
| isBorrowedResource() : boolean                 | Not Supported                      | This method is not necessary since returning an unmanaged resource to the pool will have no effect                                                                                                                         |
| isBorrowedResource() : boolean                 | Not Supported                      | This method is not necessary since returning an unmanaged resource to the pool will have no effect                                                                                                                         |
| release(resource : T) : Promise&lt;void&gt;    | release(resource : T) : void       | Releasing resources is a synchronous operation so there is no need to return a promise                                                                                                                                     |
| destroy(resource : T) : Promise&lt;void&gt;    | destroy(resource : T) : void       | Resources are destroyed in the background so there is no need for this method to return a promise                                                                                                                          |
| start() : <void&gt;                            | initialise() : Promise&lt;void&gt; | Resolves once the minimum number of resources have been added to the pool, or rejects if the optional `initialiseTimeout` is exceeded. You do not need to wait for the initialise method to resolve if you do not want to. |
| ready() : <void&gt;                            | Not Supported                      | Await the initialise method instead.                                                                                                                                                                                       |
| use() : Promise&lt;any&gt;                     | Not Supported                      | We will consider adding this feature if needed.                                                                                                                                                                            |
| drain() : Promise&lt;void&gt;                  | shutdown() : Promise&lt;void&gt;   |                                                                                                                                                                                                                            |
| clear() : Promise&lt;void&gt; Not Supported    | Not necessary with X-Pool          |

### Events

| Generic Pool            | X-Pool                                       | Notes                                       |
| ----------------------- | -------------------------------------------- | ------------------------------------------- |
| factoryCreateError      | ERR_X&#8209;POOL_RESOURCE_CREATION_FAILED    | Use `Errors.ResourceCreationFailed.code`    |
| factoryDestructionError | ERR_X&#8209;POOL_RESOURCE_DESTRUCTION_FAILED | Use `Errors.ResourceDestructionFailed.code` |

### Pool Stats

| Generic Pool          | X-Pool                           | Notes |
| --------------------- | -------------------------------- | ----- |
| spareResourceCapacity | stats().spare                    |       |
| size                  | stats().size                     |       |
| available             | stats().idle                     |       |
| borrowed              | stats().acquired                 |       |
| pending               | stats().queued + stats().pending |       |
| max                   | Not Supported                    |       |
| min                   | Not Supported                    |       |
