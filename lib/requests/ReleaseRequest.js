const BaseRequest = require('./BaseRequest');

class ReleaseRequest extends BaseRequest {

  get name() {
    return 'release';
  }
}

module.exports = ReleaseRequest;
