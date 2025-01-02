const BaseOperation = require('./BaseOperation');

class ReleaseOperation extends BaseOperation {

  get name() {
    return 'release';
  }
}

module.exports = ReleaseOperation;
