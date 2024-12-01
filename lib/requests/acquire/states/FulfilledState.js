const debug = require('debug')('XPool:Queue:FulfilledState');
const BaseState = require('./BaseState');

class FulfilledState extends BaseState {

  get name() {
  	return 'fulfilled';
  }

  moveTo() {
    throw new Error('Cannot move request once it has been fulfilled');
  }

  accept(request) {
    this._request = request;
    return this;
  }

  abort() {
    debug(`Suppressing abort of ${this.name} request`)
  }
}

module.exports = FulfilledState;
