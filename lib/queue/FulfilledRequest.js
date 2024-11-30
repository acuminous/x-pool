const debug = require('debug')('XPool:Queue:FulfilledRequest');
const BaseRequest = require('./BaseRequest');

class FulfilledRequest extends BaseRequest {

  get name() {
  	return 'fulfilled';
  }

  abort() {
    debug(`Suppressing abort of ${this.name} request`)
  }
}

module.exports = FulfilledRequest;
