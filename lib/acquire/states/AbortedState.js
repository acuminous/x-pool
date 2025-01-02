const { debug } = require('../../XPoolDebug');
const TerminatedState = require('./TerminatedState');

class AbortedState extends TerminatedState {

  get name() {
    return 'aborted';
  }

  requeue() {
    debug(`Suppressing requeue of ${this.name} request`);
  }
}

module.exports = AbortedState;
