const debug = require('debug')('XPool:acquire:AbortedState');
const BaseState = require('./BaseState');

class AbortedState extends BaseState {

  #error;

  constructor(stateMachine, error) {
    super(stateMachine);
    this.#error = error;
  }

  get name() {
    return 'aborted';
  }

  moveTo() {
    throw new Error('Cannot move request once it has been aborted');
  }

  accept(request) {
    this._request = request;
    return this;
  }

  dequeue() {
    throw this.#error;
  }

  requeue() {
    debug(`Suppressing requeue of ${this.name} request`);
  }
}

module.exports = AbortedState;
