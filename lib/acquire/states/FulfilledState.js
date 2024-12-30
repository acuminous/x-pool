const debug = require('debug')('XPool:acquire:FulfilledState');
const XPoolError = require('../../XPoolError');
const BaseState = require('./BaseState');

class FulfilledState extends BaseState {

  get name() {
    return 'fulfilled';
  }

  transition() {
    throw XPoolError.invalidOperation('Requests cannot change state once fulfilled');
  }

  abort() {
    debug(`Suppressing abort of ${this.name} request`);
  }
}

module.exports = FulfilledState;
