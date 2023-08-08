# X-Pool

[![Node.js CI](https://github.com/acuminous/x-pool/workflows/Node.js%20CI/badge.svg)](https://github.com/acuminous/x-pool/actions?query=workflow%3A%22Node.js+CI%22)
[![Code Climate](https://codeclimate.com/github/acuminous/x-pool/badges/gpa.svg)](https://codeclimate.com/github/acuminous/x-pool)
[![Test Coverage](https://codeclimate.com/github/acuminous/x-pool/badges/coverage.svg)](https://codeclimate.com/github/acuminous/x-pool/coverage)

X-Pool is a generic resource pool library for Node.js inspired by [generic-pool/node-pool](https://github.com/coopernurse/node-pool) which sadly has some [long standing and serious bugs](https://github.com/coopernurse/node-pool/issues/197).

## TL;DR
```js
const { Pool } = require('x-pool');
const CustomResourceFactory = require('./CustomResourceFactory');
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

| Name | Type | Required | Default | Notes |
|------|------|----------|---------|-------|
| factory | ResourceFactory | Y |  | An instance of a resource factory |
| minSize | integer | N | 0 | Specifies the minimum pool size. |
| maxSize | integer | N | Infinity  | Specifies the maximum pool size. |
| acquireTimeout | integer | Y |  | The number of milliesconds the pool will wait to acquire a resource before rejecting. |
| acquireRetryInterval | integer | N | 100 | The number of milliseconds the pool will wait before retrying resource acquision after a failure. |
| destroyTimeout | integer | Y | | The number of milliseconds the pool will wait for the factory to validate a resource. |
| initialiseTimeout | integer | N | | The number of milliseconds the pool will wait to initialise. |
| shutdownTimeout | integer | N | | The number of milliseconds the pool will wait to shutdown. |
| revalidateInterval | integer | N | | The number of milliseconds the pool will wait after an idle resource's creation or release before revalidating it. |

#### Errors

| Code | Notes |
|------|-------|
| ERR_X&#8209;POOL_CONFIGURATION_ERROR | The pool was passed an invalid set of configuration options |

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
Acquires and validates a resource from the pool, creating one if necessary as long as the optional maximum pool size has not been reached. If the pool is exhausted this method will block until a resource becomes available or the acquireTimeout is exceeded. If the acquireTimeout is exceed the method will reject. Resources created after the timeout is exceeded will be added to the pool.

There are equally strong arguments to re-issue the most recently used reosurce as as the least recently used. X-Pool deliberately offers no guarantees of the order in which idle resources are re-issued, and instead provides the option of keeping the resources warm by revalidating idle resources reguarly via the `revalidateInterval` configuration option.

#### Errors

| Code | Notes |
|------|-------|
| ERR_X&#8209;POOL_OPERATION_TIMEDOUT | The acquire timeout was exceeded |
| ERR_X&#8209;POOL_SHUTDOWN           | The pool has been shutdown |

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
const { size, acquired, idle, spare, available, bad } = pool.stats();
```
Returns the following of statistics about the pool

| Name | Type | Notes |
|------|------|-------|
| size | integer | The current pool size (idle + acquired + bad) |
| idle | integer | The number of resources currently idling in the pool |
| acquired | integer | The number of resources currently in use |
| bad | integer | The number of resourses which failed to be destroyed |
| available | integer | The number of resources available from the pool (maxSize - acquired - bad) |


### shutdown() : Promise<void>
```js
await pool.shutdown();
```
Shuts down the pool. After calling shutdown any inflight acquisition requests will be allowed to continue but new requests will be rejected. Once there are no inflight requests the remaining idle resources will be destroyed. The method blocks until all resources have been destroyed or until the shutdownTimeout expires. Calling shutdown repeatedly will yield an error.

#### Errors

| Code | Notes |
|------|-------|
| ERR_X&#8209;POOL_OPERATION_TIMEDOUT | The shutdown timeout was exceeded |
| ERR_X&#8209;POOL_SHUTDOWN           | The pool has been shutdown or is already in the process of shutting down |

## Error Events
Resources can break while idle. Resource creation / validation can fail after the request has timedout. Resource destruction always takes place in the background, and could also error. For this reason the Pool emits events so your application can keep tabs on what's going on under the hood. All error events are emitted first as a specific event, and if not explicitly handled, re-emitted as a generic event so that you can have a catch all handler if you chose.

```js
const { Errors } = require('x-pool');
const { ResourceCreationFailed, XPoolError } = Errors;

pool.on(ResourceCreationFailed.code, (err) => {
  // Handle the resource creation failed error event in a specific way
});
pool.on(XPoolError.code, (err) => {
  // Handle all other error events in a general way
});
```

| Event | Notes |
|-------|-------|
| ERR_X&#8209;POOL_ERROR | Only emitted if one of the following events is not explicitly handled |
| ERR_X&#8209;POOL_RESOURCE_CREATION_FAILED | The factory yielded an error while creating a resource |
| ERR_X&#8209;POOL_RESOURCE_VALIDATION_FAILED | The factory yielded an error while validating a resource |
| ERR_X&#8209;POOL_RESOURCE_DESTROY_FAILED | The factory yielded an error while destroying a resource |
| ERR_X&#8209;POOL_OPERATION_TIMEDOUT | The createResource timeout was exceeded while creating a resource |
