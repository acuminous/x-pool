const UnqueuedState = require('./states/UnqueuedState');
const QueuedState = require('./states/QueuedState');
const DispatchedState = require('./states/DispatchedState');
const AbortedState = require('./states/AbortedState');
const FulfilledState = require('./states/FulfilledState');

class StateMachine {

  #request;
  #partitions;
  #handler;
  #state;

  constructor(request, partitions, handler) {
    this.#request = request;
    this.#partitions = partitions;
    this.#handler = handler;
  }

  get state() {
    return this.#state;
  }

  toUnqueued() {
    this.#state = new UnqueuedState(this).accept(this.#request);
  }

  toQueued() {
    const queued = new QueuedState(this, this.#partitions.queued);
    this.#state = this.#state.moveTo(queued);
  }

  toDispatched() {
    const dispatched = new DispatchedState(this, this.#partitions.dispatched);
    this.#state = this.#state.moveTo(dispatched);
    this.#handler(this.#request);
  }

  toAborted(error) {
    const aborted = new AbortedState(this, error);
    this.#state = this.#state.moveTo(aborted);
  }

  toFulfilled() {
    const fulfilled = new FulfilledState(this);
    this.#state = this.#state.moveTo(fulfilled);
  }

}

module.exports = StateMachine;
