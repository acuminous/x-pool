const { debug } = require('../../XPoolDebug');
const TerminatedState = require('./TerminatedState');

class AbortedState extends TerminatedState {

  #error;

  constructor(stateMachine, store, error) {
    super(stateMachine, store);
    this.#error = error;
  }

  get name() {
    return 'aborted';
  }

  dequeue() {
    throw this.#error;
  }

  requeue() {
    debug(`Suppressing requeue of ${this.name} request`);
  }
}

module.exports = AbortedState;
