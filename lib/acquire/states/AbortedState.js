const debug = require('debug')('XPool:acquire:AbortedState');
const BaseState = require('./BaseState');
const InvalidOperation = require('../../errors/InvalidOperation');

class AbortedState extends BaseState {

  #error;

  constructor(stateMachine, store, error) {
    super(stateMachine, store);
    this.#error = error;
  }

  get name() {
    return 'aborted';
  }

  transition() {
    throw new InvalidOperation('Requests cannot change state once aborted');
  }

  dequeue() {
    throw this.#error;
  }

  requeue() {
    debug(`Suppressing requeue of ${this.name} request`);
  }
}

module.exports = AbortedState;
