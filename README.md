# X-Pool
X-Pool is a generic resource pool library for Node.js inspired by [generic-pool/node-pool](https://github.com/coopernurse/node-pool) which sadly has some long standing and serious bugs [#197](https://github.com/coopernurse/node-pool/issues/197).

## Configuration Options

| Name | Type | Required | Default | Notes |
|------|------|----------|---------|-------|
| factory | ResourceFactory | Y |  | an instance of a resource factory |
| minSize | integer | N | 0 | Specifies the minimum pool size. |
| maxSize | integer | N |   | Specifies the maximum pool size. |
| concurrency | integer | N | | Specifies the pool concurrency (i.e. how many resources it will create, validate and destroy at the same time. |
| acquireTimeout | integer | Y |  | The number of milliesconds the pool will wait to acquire a resource before rejecting. |
| createTimeout | integer | N | | The number of milliseconds the pool will wait for the factory to create a resource. |
| validateTimeout | integer | N | | The number of milliseconds the pool will wait for the factory to validate a resource. |
| destroyTimeout | integer | N | | The number of milliseconds the pool will wait for the factory to validate a resource. |
| shutdownTimeout | integer | N | | The number of milliseconds the pool will wait to shutdown. |

```js
const { Pool } = require('x-pool');
const MyCustomFactory = require('./MyCustomFactory');
const factory = new MyCustomFactory();
const pool = new Pool({ factory, acquireTimeout: 5000 }); 
```

## API

### Pool.acquire() : Promise<T>
Acquires and validates a resource from the pool, creating one if necessary as long as the maximum pool size has not been reached. If the pool is exhausted this function will block until a resource becomes available or the acquireTimeout is exceeded. Resources obtained after the timeout is exceeded will be returned to the pool or destroyed if the pool is full.

```js
const resource = await pool.acquire();
```

#### Errors
| Code | Notes |
|------|-------|
| ERR_X-POOL_TIMEDOUT | The acquire timeout was exceeded |
| ERR_X-POOL_SHUTDOWN | The pool has been shutdown |

### Pool.release(resource: T) : void
Returns a resource to the pool. If the resource is not managed it will be discarded without error.

```js
pool.release(resource);
```

### Pool.destroy() : void
Instructs the pool to destroy a resource instead of returning it to the pool, which is useful if you know the resource is broken. The act of destroying a resource is asynchronous but is completed in the background so the destroy method returns instantly.

```js
pool.destroy(resource);
```

### Pool.stats() : PoolStats
Returns the following of statistics about the pool

| Name | Type | Notes |
|------|------|-------|
| size | integer | The current pool size (acquired + idle) |
| acquired | integer | The number of resources currently in use |
| idle | integer | The number of resources currently idling in the pool |
| spare | integer | The number of resources that can still be created. Will be `Infinity` if no maxSize is set |
| available | integer | The number of resources available from the pool (idle + spare) |

### Pool.shutdown() : Promise<void>
Shuts down the pool. After calling shutdown any inflight acquisition requests will be allowed to continue but new requests will be rejected. Once there are no inflight requests any idle resources will be destroyed. The method blocks until shutdown is complete or until the shutdownTimeout expires. Calling shutdown repeatedly will yield an error.

```js
await pool.shutdown();
```

#### Errors
| Code | Notes |
|------|-------|
| ERR_X-POOL_TIMEDOUT | The shutdown timeout was exceeded |
| ERR_X-POOL_SHUTDOWN | The pool has been shutdown |

## Error Events
Resources can break while idle. Resource creation / validation can fail after the request has timedout. Resource destruction always takes place in the background, and could also error. For this reason the Pool emits events so your application can keep tabs on what's going on under the hood. All error events are emitted first as a specific event, but if not handled, re-emitted as a generic event so that you can have a catch all handler if you chose.

```js
const { Events } = require('x-pool');
const { XPoolResourceCreationEvent, XPoolErrorEvent } = Events;

pool.on(XPoolResourceCreationEvent.code, (err) => {
  // Handle an error event in a specific way
});
pool.on(XPoolErrorEvent.code, (err) => {
  // Handle all error events in a general way
});
```

| Event | Notes |
|-------|-------|
| EVT_X-POOL_RESOURCE_CREATION_FAILED | The factory yielded an error while creating a resource |
| EVT_X-POOL_RESOURCE_CREATION_TIMEDOUT | The createResource timeout was exceeded while creating a resource |
| EVT_X-POOL_RESOURCE_VALIDATION_FAILED | The factory yielded an error while validating a resource |
| EVT_X-POOL_RESOURCE_VALIDATION_TIMEDOUT | The validateResource timeout was exceeded while validating a resource | 
| EVT_X-POOL_RESOURCE_DESTROY_FAILED | The factory yielded an error while destroying a resource |
| EVT_X-POOL_RESOURCE_DESTROY_TIMEDOUT | The destroyResource timeout was exceeded while validating a resource | 
