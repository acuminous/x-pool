### TODO
- initialPoolSize (can be less than min for quick start, but must be less than or equal to max). Used to size the pool on startup
- Resource validation
- Resource reset
- autoStart
- Reap Idle resources
  - maxIdleTime
- FIFO vs LIFO
- Limit stop concurrency
- Add error code
- Option to stop quickly, which aborts queued requests (but not dispatched ones)
- Resources which timeout during acquision but not creation/validation are currently moved to segregated. This means we will not wait for them to be created when stopping the pool. We might need another "ward" for commands that haven't timed out yet when the start/acquire/stop timesous
- Check factory destroy is actually called from tests
- Kill pool when an event listener throws an error instead of emitting an error
- Make release & destroy synchronous (from the users' perspective), and consider putting checkQueue / checkPool in a setImmediate
- Rename Requests AsyncRequest (as they have a latch, and yield)

