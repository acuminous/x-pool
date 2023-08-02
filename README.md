# X-Pool
X-Pool is a generic resource pool library for Node.js inspired by [generic-pool/node-pool](https://github.com/coopernurse/node-pool) which sadly has some long standing and serious bugs [#197](https://github.com/coopernurse/node-pool/issues/197).

## TL;DR
```js
const { Pool } = require('x-pool');
const CustomResourceFactory = require('./CustomResourceFactory');
const factory = new CustomResourceFactory();
const pool = new Pool({ factory, acquireTimeout: 5000 });

const resource = await pool.acquire();
try {
  // Do work
} finally {
  pool.release(resource);
}
```

## Configuration Options

| Name | Type | Required | Default | Notes |
|------|------|----------|---------|-------|
| factory | ResourceFactory | Y |  | an instance of a resource factory |
| minSize | integer | N | 0 | Specifies the minimum pool size. |
| maxSize | integer | N | Infinity  | Specifies the maximum pool size. |
| concurrency | integer | N | | Specifies the pool concurrency (i.e. how many resources it will create, validate and destroy at the same time). |
| acquireTimeout | integer | Y |  | The number of milliesconds the pool will wait to acquire a resource before rejecting. |
| createTimeout | integer | N | | The number of milliseconds the pool will wait for the factory to create a resource. |
| validateTimeout | integer | N | | The number of milliseconds the pool will wait for the factory to validate a resource. |
| destroyTimeout | integer | N | | The number of milliseconds the pool will wait for the factory to validate a resource. |
| initialiseTimeout | integer | N | | The number of milliseconds the pool will wait to initialise. |
| shutdownTimeout | integer | N | | The number of milliseconds the pool will wait to shutdown. |
| validateInterval | integer | N | | The number of milliseconds the pool will wait after an idle resource's creation or release before revalidating it. |

#### Errors
| Code | Notes |
|------|-------|
| ERR_X-POOL_CONFIGURATION_ERROR | The pool was passed an invalid set of configuration options |

## Custom Factories
A factory is a user implemented object which must expose the following three methods:

### create(pool) : Promise<T>
Must yield a new resource or reject if the resource could not be created.

### validate(resource: T) : Promise<void>
Must yield if the resource is confirmed to be working or reject if the resource is found to be broken.

### destroy(resource: T) : Promise<void>
Must destroy the supplied resource or reject if the resource could not be destroyed.

### Example
```js
module.exports = class DatabaseFactory {
  constructor(options) {
    this._options = options;
  }

  async create() {
    return db.connect(this._options);
  }

  async validate(client) {
    await client.query('SELECT 1');
  }

  async destroy(client) {
    await client.close();
  }
}
```

## Pool API

### initialise() : Promise<void>
```js
const resource = await pool.initialise();
```
Initialisise the pool, only yielding after the minimum number of resources have been created or if the initialiseTimeout is exceeded. You do not need to wait for the pool to initialise, however it is recommented in order to ensure your factory is correctly configured and has access to the required systems.

### acquire() : Promise<T>
```js
const resource = await pool.acquire();
```
Acquires and validates a resource from the pool, creating one if necessary as long as the maximum pool size has not been reached. If the pool is exhausted this function will block until a resource becomes available or the acquireTimeout is exceeded. Resources obtained after the timeout is exceeded will be returned to the pool or destroyed if the pool is full.

There are equally strong arguments to re-issue the most recently used as it is most likely to be working, or the least recently used so that resources with permanent network connections are less likely to time out. X-Pool deliberately offers no guarantees of the order in which idle resources are re-issued because these problems are better solved by keeping the resources warm via the `validateInterval` configuration option.

#### Errors
| Code | Notes |
|------|-------|
| ERR_X-POOL_TIMEDOUT | The acquire timeout was exceeded |
| ERR_X-POOL_SHUTDOWN | The pool has been shutdown |

### release(resource: T) : void
```js
pool.release(resource);
```
Returns a resource to the pool. If the resource is not managed it will be discarded without error. 

### destroy() : void
```js
pool.destroy(resource);
```
Instructs the pool to destroy a resource instead of returning it to the pool, which is useful if you know the resource is broken. The act of destroying a resource is asynchronous but is completed in the background so the destroy method returns instantly.

### stats() : PoolStats
```js
const { size, acquired, idle, spare, available } = pool.stats();
```
Returns the following of statistics about the pool

| Name | Type | Notes |
|------|------|-------|
| size | integer | The current pool size (acquired + idle) |
| acquired | integer | The number of resources currently in use |
| idle | integer | The number of resources currently idling in the pool |
| spare | integer | The number of resources that can still be created. Will be `Infinity` if no maxSize is set |
| available | integer | The number of resources available from the pool (idle + spare) |

### shutdown() : Promise<void>
```js
await pool.shutdown();
```
Shuts down the pool. After calling shutdown any inflight acquisition requests will be allowed to continue but new requests will be rejected. Once there are no inflight requests the remaining idle resources will be destroyed. The method blocks until all resources have been destroyed or until the shutdownTimeout expires. Calling shutdown repeatedly will yield an error.

#### Errors
| Code | Notes |
|------|-------|
| ERR_X-POOL_TIMEDOUT | The shutdown timeout was exceeded |
| ERR_X-POOL_SHUTDOWN | The pool has been shutdown or is already in the process of shutting down |

## Error Events
Resources can break while idle. Resource creation / validation can fail after the request has timedout. Resource destruction always takes place in the background, and could also error. For this reason the Pool emits events so your application can keep tabs on what's going on under the hood. All error events are emitted first as a specific event, and if not explicitly handled, re-emitted as a generic event so that you can have a catch all handler if you chose.

```js
const { Events } = require('x-pool');
const { XPoolResourceCreationEvent, XPoolErrorEvent } = Events;

pool.on(XPoolResourceCreationFailedEvent.code, (err) => {
  // Handle the resource creation failed error event in a specific way
});
pool.on(XPoolErrorEvent.code, (err) => {
  // Handle all other error events in a general way
});
```

| Event | Notes |
|-------|-------|
| ERR_X-POOL_RESOURCE_CREATION_FAILED | The factory yielded an error while creating a resource |
| ERR_X-POOL_RESOURCE_CREATION_TIMEDOUT | The createResource timeout was exceeded while creating a resource |
| ERR_X-POOL_RESOURCE_VALIDATION_FAILED | The factory yielded an error while validating a resource |
| ERR_X-POOL_RESOURCE_VALIDATION_TIMEDOUT | The validateResource timeout was exceeded while validating a resource | 
| ERR_X-POOL_RESOURCE_DESTROY_FAILED | The factory yielded an error while destroying a resource |
| ERR_X-POOL_RESOURCE_DESTROY_TIMEDOUT | The destroyResource timeout was exceeded while validating a resource | 
