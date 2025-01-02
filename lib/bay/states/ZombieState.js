const { debug } = require('../../XPoolDebug');
const TerminatedState = require('./TerminatedState');

class ZombieState extends TerminatedState {

  get name() {
    return 'zombie';
  }
}

module.exports = ZombieState;
