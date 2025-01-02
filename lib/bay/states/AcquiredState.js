const BaseState = require('./BaseState');
const Command = require('../../command/Command');
const { debug } = require('../../XPoolDebug');
const XPoolEvents = require('../../XPoolEvents');

class AcquiredState extends BaseState {

  #resetResource;

  constructor(stateMachine, store, resetResource) {
    super(stateMachine, store);
    this.#resetResource = resetResource;
  }

  get name() {
    return 'acquired';
  }

  skipReset() {
    debug(`Skipped reset for resource in ${this.name} bay`);
    this._stateMachine.toReset();
  }

  async reset(resource) {
    debug(`Resetting resource in ${this.name} bay`);
    this.#resetResource.on(Command.SUCCESS, (payload) => this.#onResetSuccess(payload));
    this.#resetResource.on(Command.ERROR, (payload) => this.#onResetError(payload));
    this.#resetResource.on(Command.TIMEOUT, (payload) => this.#onResetTimeout(payload));
    this.#resetResource.on(Command.POST_TIMEOUT_SUCCESS, (payload) => this.#onBelatedResetSuccess(payload));
    this.#resetResource.on(Command.POST_TIMEOUT_ERROR, (payload) => this.#onBelatedResetError(payload));
    this.#resetResource.on(Command.POST_ABORT_SUCCESS, (payload) => this.#onBelatedResetSuccess(payload));
    this.#resetResource.on(Command.POST_ABORT_ERROR, (payload) => this.#onBelatedResetError(payload));
    await this.#resetResource.execute(resource);
  }

  #onResetSuccess() {
    debug(`Successfully reset resource in ${this.name} bay`);
    this._stateMachine.toReset();
    this._notify(XPoolEvents.RESOURCE_RESET);
  }

  #onResetError({ error }) {
    debug(`Error resetting resource in ${this.name} bay`, error);
    this._notify(XPoolEvents.RESOURCE_RESET_ERROR, { error });
    this.destroy();
  }

  #onResetTimeout({ timeout }) {
    debug(`Timed out after ${timeout.toLocaleString()}ms resetting resource in ${this.name} bay`);
    this._notify(XPoolEvents.RESOURCE_RESET_TIMEOUT, { timeout });
    this.#segregate();
  }

  #onBelatedResetSuccess() {
    debug(`Belated success reseting resource in ${this.name} bay`);
    this._notify(XPoolEvents.RESOURCE_RESET);
    this._bay.destroy();
  }

  #onBelatedResetError = ({ error }) => {
    debug(`Belated error reseting resource in ${this.name} bay`, error);
    this._notify(XPoolEvents.RESOURCE_RESET_ERROR, { error });
    this._bay.destroy();
  };

  #segregate() {
    debug(`Segregating ${this.name} bay`);
    this._stateMachine.toTimedout();
    this._notify(XPoolEvents.RESOURCE_SEGREGATED);
  }

  async destroy() {
    debug(`Dooming ${this.name} bay`);
    this._stateMachine.toDoomed();
    await this._bay.destroy();
  }
}

module.exports = AcquiredState;
