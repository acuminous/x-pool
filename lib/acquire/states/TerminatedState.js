const { debug } = require('../../XPoolDebug');
const BaseState = require('./BaseState');
const InvalidOperation = require('../../errors/InvalidOperation');

class TerminatedState extends BaseState {

  transition() {
    throw new InvalidOperation(`Cannot transition ${this.name} bay`);
  }
}

module.exports = TerminatedState;
