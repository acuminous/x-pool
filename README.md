### TODO
- initialPoolSize (can be less than min for quick start, but must be less than or equal to max). Used to size the pool on startup
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

Add config for
  validationInterval: Infinity,
  maxIdleDuration: Infinity,
  immunityDuration: 60000,

Check if bay metadata is used / what metadata might be useful. Currently some state transitions are routed through the bay, where they update metadata, others are made directly from the state, and so bypass the bay metadata.

Can resource.destroy move to doomed state, then call destroy?

Use separate store for resources that have timedout, and resources that were abandoned so that shutdown will wait for the abandoned resources to complete

Consider renaming doomed to destroying (maybe just in the stats)

Consider adding a RESOURCE_ZOMBIED event (or words to that effect)

Do not catch all errors - instead check to ensure that it is and error that XPool might expect, e.g. a Factory Error or a Timeout Error

Close the pool when all resources have been zombied

Check that requeueing a request during start does not lose the debug context