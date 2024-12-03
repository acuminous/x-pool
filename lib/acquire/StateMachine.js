const UnqueuedState = require('./states/UnqueuedState');
const QueuedState = require('./states/QueuedState');
const DispatchedState = require('./states/DispatchedState');
const AbortedState = require('./states/AbortedState');
const FulfilledState = require('./states/FulfilledState');

class StateMachine {

  #request;
  #stores;
  #handler;
  #state;

  constructor(request, stores, handler) {
    this.#request = request;
    this.#stores = stores;
    this.#handler = handler;
    this.#state = new UnqueuedState(this, this.#stores.unqueued).accept(this.#request);
  }

  get state() {
    return this.#state;
  }

  toQueued() {
    const queued = new QueuedState(this, this.#stores.queued);
    this.#state = this.#state.transition(queued);
  }

  toDispatched() {
    const dispatched = new DispatchedState(this, this.#stores.dispatched);
    this.#state = this.#state.transition(dispatched);
    this.#handler(this.#request);
  }

  toAborted(error) {
    const aborted = new AbortedState(this, this.#stores.aborted, error);
    this.#state = this.#state.transition(aborted);
  }

  toFulfilled() {
    const fulfilled = new FulfilledState(this, this.#stores.fulfilled);
    this.#state = this.#state.transition(fulfilled);
  }

}

module.exports = StateMachine;
