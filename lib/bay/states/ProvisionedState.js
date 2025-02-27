const { debug } = require('../../XPoolDebug');
const BaseState = require('./BaseState');
const Command = require('../../command/Command');
const XPoolEvents = require('../../XPoolEvents');

class ProvisionedState extends BaseState {

  #validateResource;

  constructor(stateMachine, store, validateResource) {
    super(stateMachine, store);
    this.#validateResource = validateResource;
  }

  get name() {
    return 'provisioned';
  }

  async provision() {
    debug(`Suppressing request to provision ${this.name} bay`);
  }

  skipValidation() {
    debug(`Skipped validation for resource in ${this.name} bay`);
    this._stateMachine.toReady();
  }

  async validate(resource) {
    debug(`Validating resource in ${this.name} bay`);
    this.#validateResource.on(Command.SUCCESS, (payload) => this.#onValidateSuccess(payload));
    this.#validateResource.on(Command.ERROR, (payload) => this.#onValidateError(payload));
    this.#validateResource.on(Command.TIMEOUT, (payload) => this.#onValidateTimeout(payload));
    this.#validateResource.on(Command.POST_TIMEOUT_SUCCESS, (payload) => this.#onBelatedValidateSuccess(payload));
    this.#validateResource.on(Command.POST_TIMEOUT_ERROR, (payload) => this.#onBelatedValidateError(payload));
    this.#validateResource.on(Command.POST_ABORT_SUCCESS, (payload) => this.#onBelatedValidateSuccess(payload));
    this.#validateResource.on(Command.POST_ABORT_ERROR, (payload) => this.#onBelatedValidateError(payload));
    await this.#validateResource.execute(resource);
  }

  #onValidateSuccess() {
    debug(`Successfully validated resource in ${this.name} bay`);
    this._bay.validated(new Date());
    this._stateMachine.toReady();
    this._notify(XPoolEvents.RESOURCE_VALIDATED);
  }

  #onValidateError({ error }) {
    debug(`Error validating resource in ${this.name} bay`, error);
    this._notify(XPoolEvents.RESOURCE_VALIDATION_ERROR, { error });
    this.#destroy();
  }

  #onValidateTimeout({ timeout }) {
    debug(`Timed out after ${timeout.toLocaleString()}ms validating resource in ${this.name} bay`);
    this._notify(XPoolEvents.RESOURCE_VALIDATION_TIMEOUT, { timeout });
    this.#segregate();
  }

  #onBelatedValidateSuccess() {
    debug(`Belated success validating resource in ${this.name} bay`);
    this._notify(XPoolEvents.RESOURCE_VALIDATED);
    this._bay.destroy();
  }

  #onBelatedValidateError = ({ error }) => {
    debug(`Belated error validating resource in ${this.name} bay`, error);
    this._notify(XPoolEvents.RESOURCE_VALIDATION_ERROR, { error });
    this._bay.destroy();
  };

  abandon() {
    debug(`Abandoning resource validation in${this.name} bay`);
    this.#segregate();
    this.#validateResource.abort();
    this._notify(XPoolEvents.RESOURCE_VALIDATION_ABANDONED);
  }

  #segregate() {
    debug(`Segregating ${this.name} bay`);
    this._stateMachine.toTimedout();
    this._notify(XPoolEvents.RESOURCE_SEGREGATED);
  }

  async #destroy() {
    debug(`Dooming ${this.name} bay`);
    this._stateMachine.toDoomed();
    this._bay.destroy();
  }
}

module.exports = ProvisionedState;
