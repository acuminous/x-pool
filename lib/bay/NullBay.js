const debug = require('debug')('XPool:bay:NullBay');

class NullBay {

  async release() {
    debug('Nothing to do');
  }

}

module.exports = NullBay
