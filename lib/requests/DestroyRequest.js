const BaseRequest = require('./BaseRequest');

class DestroyRequest extends BaseRequest {

  get name() {
    return 'destroy';
  }
}

module.exports = DestroyRequest;
