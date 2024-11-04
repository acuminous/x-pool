const BaseRequest = require('./BaseRequest');

class FulfilledRequest extends BaseRequest {

  get name() {
  	return 'fulfilled';
  }
}

module.exports = FulfilledRequest;
