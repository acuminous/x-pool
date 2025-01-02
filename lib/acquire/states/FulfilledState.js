const { debug } = require('../../XPoolDebug');
const TerminatedState = require('./TerminatedState');

class FulfilledState extends TerminatedState {

  get name() {
    return 'fulfilled';
  }

  abort() {
    debug(`Suppressing abort of ${this.name} request`);
  }
}

module.exports = FulfilledState;
