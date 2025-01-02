const { debug } = require('../../XPoolDebug');
const BaseState = require('./BaseState');

class TimedoutState extends BaseState {

  get name() {
    return 'timedout';
  }

  abandon() {
    debug(`Suppressing request to abandon ${this.name} bay`);
  }

  segregate() {
    debug(`Suppressing request to segregate ${this.name} bay`);
  }

  async destroy() {
    debug(`Dooming ${this.name} bay`);
    this._stateMachine.toDoomed();
    await this._bay.destroy();
  }
}

module.exports = TimedoutState;
