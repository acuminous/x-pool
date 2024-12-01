class BaseState {

  _partition;

  _request;

  constructor(partition) {
    this._partition = partition;
  }

  moveTo(destination) {
    this._partition.move(this._request, destination);
    return destination;
  }

  accept(request) {
  	this._request = request;
    this._partition.accept(this._request);
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
