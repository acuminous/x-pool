const debug = require('debug')('XPool:bay:SegregatedState');
const BaseState = require('./BaseState');

class SegregatedState extends BaseState {

  get name() {
    return 'segregated';
  }

  segregate() {
    debug(`Suppressing request to segregate ${this._bay.state} bay [${this._bay.shortId}]`);
  }

  async destroy() {
    debug(`Dooming ${this._bay.state} bay [${this._bay.shortId}]`);
    this._bay._toDoomed();
    await this._bay.destroy();
  }
}

module.exports = SegregatedState;
