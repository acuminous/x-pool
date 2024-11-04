const BaseRequest = require('./BaseRequest');

class AbortedRequest extends BaseRequest {

  get name() {
    return 'aborted';
  }

  requeue() {
    return this;
  };

  dequeue() {
    throw new Error('The request has been aborted');
  }
}

module.exports = AbortedRequest;
