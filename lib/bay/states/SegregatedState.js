const debug = require('debug')('XPool:bay:SegregatedState');
const BaseState = require('./BaseState');

class SegregatedState extends BaseState {

  get name() {
    return 'segregated';
  }

  abort() {
    debug(`Suppressing request to abort ${this.name} bay [${this._bay.shortId}]`);
  }

  segregate() {
    debug(`Suppressing request to segregate ${this.name} bay [${this._bay.shortId}]`);
  }

  async destroy() {
    debug(`Dooming ${this.name} bay [${this._bay.shortId}]`);
    this._stateMachine.toDoomed();
    await this._bay.destroy();
  }
}

module.exports = SegregatedState;
