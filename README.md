# X-Pool
X-Pool is a generic resource pool library for Node.js inspired by [generic-pool/node-pool](https://github.com/coopernurse/node-pool) which sadly has some long standing and serious bugs [#197](https://github.com/coopernurse/node-pool/issues/197).

## Configuration Options

| name | type | required | default | notes |
|------|------|----------|---------|-------|
| min  | integer |  | 0 | Specifies the minimum pool size. |
| max  | integer |  |   | Specifies the maximum pool size. |
| acquireTimeout | integer | Y |  | The number of milliesconds the pool will wait to acquire a resource before rejecting. |
| createTimeout | integer | Y |  | The number of milliseconds the pool will wait for the factory to create a resource. |
| validateTimeout | integer | Y | | The number of milliseconds the pool will wait for the factory to validate a resource. |

## API

### Pool.acquire

### Pool.release

### Pool.destroy

### Pool.stats

## Events
