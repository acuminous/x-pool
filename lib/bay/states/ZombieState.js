const debug = require('debug')('XPool:bay:Zombie');
const InvalidOperation = require('../../errors/InvalidOperation');
const BaseState = require('./BaseState');

class ZombieState extends BaseState {

  get name() {
    return 'zombie';
  }

  transition() {
    throw new InvalidOperation('Bays cannot change state once zombified');
  }

  accept(bay) {
    this._bay = bay;
    return this;
  }
}

module.exports = ZombieState;
