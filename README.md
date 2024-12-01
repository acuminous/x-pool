
### TODO
- Resource validation
- Resource release
- Reap Idle resources
- FIFO vs LIFO
- Acquire Retry Wait option (slow creation on error)
- Add pool.with(async (resource) => {}) API
- Limit start and stop concurrency
- Add error code
- Option to stop quickly, which aborts queued requests (but not dispatched ones)
- Resources which timeout during acquision but not creation/validation are currently moved to segregated. This means we will not wait for them to be created when stopping the pool. We might need another "ward" for commands that haven't timed out yet when the start/acquire/stop timesous
- Check factory destroy is actually called from tests
- Kill pool when an event listener throws an error instead of emitting an error