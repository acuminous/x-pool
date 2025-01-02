const BaseRequest = require('./BaseRequest');

class StartRequest extends BaseRequest {

  get name() {
    return 'start'
  }
}

module.exports = StartRequest;
