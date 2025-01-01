const debug = require('debug')('XPool:bay:NullBay');

class NullBay {

  async reset() {
    debug('Suppressing reset');
  }

  release() {
    debug('Suppressing release');
  }

  async destroy() {
    debug('Suppressing destroy');
  }
}

module.exports = NullBay;
