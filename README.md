# X-Pool
X-Pool is a generic resource pool library for Node.js inspired by [generic-pool/node-pool](https://github.com/coopernurse/node-pool) which sadly has some long standing and serious bugs [#197](https://github.com/coopernurse/node-pool/issues/197).

## Configuration Options

| name | type | required | default | notes |
|------|------|----------|---------|-------|
| minSize | integer |  | 0 | Specifies the minimum pool size. |
| maxSize | integer |  |   | Specifies the maximum pool size. |
| acquireTimeout | integer | Y |  | The number of milliesconds the pool will wait to acquire a resource before rejecting. |
| createTimeout | integer | Y |  | The number of milliseconds the pool will wait for the factory to create a resource. |
| validateTimeout | integer | Y | | The number of milliseconds the pool will wait for the factory to validate a resource. |

## API

### Pool.acquire
Acquires and validates a resource from the pool, creating one if necessary as long as the maximum pool size has not been reached. If the pool is exhausted this function will block until a resource becomes available or the acquireTimeout is exceeded. Resources obtained after the timeout is exceeded will be returned to the pool or destroyed if the pool is full.
```js
const resource = await pool.acquire();
```

#### Errors
| Code | Notes |
|------|-------|
| ERR_X-POOL_TIMEOUT_EXCEEDED | The acquire timeout was exceeded |
| ERR_X-POOL_SHUTDOWN | The pool has been shutdown |

### Pool.release

### Pool.destroy

### Pool.stats

## Events
