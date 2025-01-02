const { debug } = require('../XPoolDebug');

class NullRequest {

  dispatch() {
    debug('Suppressing dispatch');
  }

}

module.exports = NullRequest;
