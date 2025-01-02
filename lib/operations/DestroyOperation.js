const BaseOperation = require('./BaseOperation');

class DestroyOperation extends BaseOperation {

  get name() {
    return 'destroy';
  }
}

module.exports = DestroyOperation;
