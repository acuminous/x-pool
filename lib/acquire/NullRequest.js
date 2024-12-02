const debug = require('debug')('XPool:acquire:NullRequest');

class NullRequest {

  dispatch() {
    debug('Suppressing dispatch');
  }

}

module.exports = NullRequest;
