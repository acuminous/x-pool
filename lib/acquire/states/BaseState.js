class BaseState {

  _stateMachine;
  _partition;
  _request;

  constructor(stateMachine, partition) {
    this._stateMachine = stateMachine;
    this._partition = partition;
  }

  transition(newState) {
    this._partition.transfer(this._request, newState._partition);
    newState._request = this._request;
    return newState;
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
