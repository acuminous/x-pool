const { debug } = require('../../XPoolDebug');
const BaseState = require('./BaseState');
const InvalidOperation = require('../../errors/InvalidOperation');

class TerminatedState extends BaseState {

  transition() {
    throw new InvalidOperation(`Cannot transition from ${this.name} request`);
  }
}

module.exports = TerminatedState;
