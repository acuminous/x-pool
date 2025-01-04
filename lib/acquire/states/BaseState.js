const InvalidOperation = require('../../errors/InvalidOperation');

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
    return newState._accept(this._request);
  }

  _accept(request) {
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

  dequeue() {
    this.#reportInvalidOperation('dequeue');
  }

  #reportInvalidOperation(operation) {
    throw new InvalidOperation(`Cannot ${operation} ${this.name} requests`);
  }
}

module.exports = BaseState;
