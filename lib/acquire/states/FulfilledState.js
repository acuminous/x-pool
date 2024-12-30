const debug = require('debug')('XPool:acquire:FulfilledState');
const InvalidOperation = require('../../errors/InvalidOperation');
const BaseState = require('./BaseState');

class FulfilledState extends BaseState {

  get name() {
    return 'fulfilled';
  }

  transition() {
    throw new InvalidOperation('Requests cannot change state once fulfilled');
  }

  abort() {
    debug(`Suppressing abort of ${this.name} request`);
  }
}

module.exports = FulfilledState;
