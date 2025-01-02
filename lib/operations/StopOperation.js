const BaseOperation = require('./BaseOperation');

class StopOperation extends BaseOperation {

  get name() {
    return 'stop';
  }

  setBay() {}
}

module.exports = StopOperation;
