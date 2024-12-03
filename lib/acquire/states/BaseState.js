class BaseState {

  _stateMachine;
  _store;
  _request;

  constructor(stateMachine, store) {
    this._stateMachine = stateMachine;
    this._store = store;
  }

  transition(newState) {
    this._store.transfer(this._request, newState._store);
    return newState.accept(this._request);
  }

  accept(request) {
    this._request = request;
    return this;
  }

  queue() {
    this.#reportInvalidOperation('queue');
  }

  abort() {
    this.#reportInvalidOperation('abort');
  }

  dispatch() {
    this.#reportInvalidOperation('dispatch');
  }

  requeue() {
    this.#reportInvalidOperation('requeue');
  }

  assign() {
    this.#reportInvalidOperation('assign');
  }

  dequeue() {
    this.#reportInvalidOperation('dequeue');
  }

  #reportInvalidOperation(operation) {
    throw new Error(`Cannot ${operation} ${this.name} requests`);
  }
}

module.exports = BaseState;
