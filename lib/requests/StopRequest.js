const BaseRequest = require('./BaseRequest');

class StopRequest extends BaseRequest {

  get name() {
    return 'stop';
  }

  setBay() {}
}

module.exports = StopRequest;
