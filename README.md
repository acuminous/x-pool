### TODO
- initialPoolSize (can be less than min for quick start, but must be less than or equal to max). Used to size the pool on startup
- Resource reset
- autoStart
- Reap Idle resources
  - maxIdleTime
- FIFO vs LIFO
- Limit stop concurrency
- Option to stop quickly, which aborts queued requests (but not dispatched ones)
- Resources which timeout during acquision but not creation/validation are currently moved to segregated. This means we will not wait for them to be created when stopping the pool. We might need another "ward" for commands that haven't timed out yet when the start/acquire/stop timesous
- Check factory destroy is actually called from tests
- Kill pool when an event listener throws an error instead of emitting an error
- Rename Requests AsyncRequest (as they have a latch, and yield)
- Make Validate configuration options a Symbol (possibly using yup to convert from strings)


Add config for
  validationInterval: Infinity,
  maxIdleDuration: Infinity,
  immunityDuration: 60000,

Check if bay metadata is used / what metadata might be useful

use debug.extend() with bays and requests

Rename Pending to indicate it is about creating a resource
Try to come up with a better name for UnvalidatedState