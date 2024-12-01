const debug = require('debug')('XPool:NullRequest');

class NullRequest {

  dispatch() {
    debug('Suppressing dispatch');
  }

}

module.exports = NullRequest;
