const debug = require('debug')('XPool:bay:BaseState');

class BaseState {

  _stateMachine;
  _store;
  _bay;

  constructor(stateMachine, store) {
    this._stateMachine = stateMachine;
    this._store = store;
  }

  transition(newState) {
    this._store.transfer(this._bay, newState._store);
    return newState.accept(this._bay);
  }

  accept(bay) {
    this._bay = bay;
    return this;
  }

  notify(event, payload) {
    this._bay.emit(event, { ...payload, requestId: this._bay.requestId });
  }

  reserve() {
    this.#reportInvalidOperation('reserve');
  }

  async provision() {
    this.#reportInvalidOperation('provision');
  }

  async validate() {
    this.#reportInvalidOperation('validate');
  }

  async skip() {
    this.#reportInvalidOperation('skip');
  }

  async release() {
    this.#reportInvalidOperation('release');
  }

  async acquire() {
    this.#reportInvalidOperation('acquire');
  }

  abort() {
    this.#reportInvalidOperation('abort');
  }

  async destroy() {
    this.#reportInvalidOperation('destroy');
  }

  segregate() {
    this.#reportInvalidOperation('segregate');
  }

  #reportInvalidOperation(operation) {
    throw new Error(`Cannot ${operation} ${this.name} bays`);
  }

}

module.exports = BaseState;
