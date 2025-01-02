const BaseOperation = require('./BaseOperation');

class StartOperation extends BaseOperation {

  get name() {
    return 'start';
  }
}

module.exports = StartOperation;
