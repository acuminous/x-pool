const { debug } = require('../../XPoolDebug');
const TerminatedState = require('./TerminatedState');

class DestroyedState extends TerminatedState {

  get name() {
    return 'destroyed';
  }

  destroy() {
    debug(`Suppressing request to destroy ${this.name} bay`);
  }

  abandon() {
    debug(`Suppressing request to abandon ${this.name} bay`);
  }
}

module.exports = DestroyedState;
