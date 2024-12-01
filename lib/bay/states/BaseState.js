const debug = require('debug')('XPool:bay:BaseState');

class BaseState {

  _partition;
  _bay;

  constructor(partition) {
    this._partition = partition;
  }

  moveTo(destination) {
    this._partition.move(this._bay, destination);
    return destination;
  }

  accept(bay) {
  	this._bay = bay;
    this._partition.accept(this._bay);
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
