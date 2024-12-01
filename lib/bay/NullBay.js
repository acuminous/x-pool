const debug = require('debug')('XPool:bay:NullBay');

class NullBay {

  async release() {
    debug(`Suppressing release`);
  }

}

module.exports = NullBay
