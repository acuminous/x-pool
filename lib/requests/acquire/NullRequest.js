const debug = require('debug')('XPool:NullRequest');

class NullRequest {

	dispatch() {
		debug('Nothing to do');
	}

}

module.exports = NullRequest
