const { debug } = require('../../XPoolDebug');
const InvalidOperation = require('../../errors/InvalidOperation');
const BaseState = require('./BaseState');

class TerminatedState extends BaseState {

  transition() {
    throw new InvalidOperation('Cannot transition destroyed bay');
  }
}

module.exports = TerminatedState;
