const debug = require('debug')('XPool:bay:UnvalidatedState');
const BaseState = require('./BaseState');
const Command = require('../../command/Command');
const Events = require('../Events');

class UnvalidatedState extends BaseState {

  #validateResource;

  constructor(stateMachine, store, validateResource) {
    super(stateMachine, store);
    this.#validateResource = validateResource;
  }

  get name() {
    return 'unvalidated';
  }

  async provision() {
    debug(`${this.name} bay [${this._bay.shortId}] is already provisioned`);
  }

  skip() {
    debug(`Skipped validation for ${this.name} bay [${this._bay.shortId}]`);
    this._stateMachine.toReady();
  }

  async validate(resource) {
    debug(`Validating ${this.name} bay [${this._bay.shortId}]`);
    this.#validateResource.on(Command.SUCCESS, (payload) => this.#onValidateSuccess(payload));
    this.#validateResource.on(Command.ERROR, (payload) => this.#onValidateError(payload));
    this.#validateResource.on(Command.TIMEOUT, (payload) => this.#onValidateTimeout(payload));
    this.#validateResource.on(Command.POST_TIMEOUT_SUCCESS, (payload) => this.#onBelatedValidateSuccess(payload));
    this.#validateResource.on(Command.POST_TIMEOUT_ERROR, (payload) => this.#onBelatedValidateError(payload));
    this.#validateResource.on(Command.POST_ABORT_SUCCESS, (payload) => this.#onBelatedValidateSuccess(payload));
    this.#validateResource.on(Command.POST_ABORT_ERROR, (payload) => this.#onBelatedValidateError(payload));
    await this.#validateResource.execute(resource);
  }

  segregate() {
    debug(`Segregating ${this.name} bay [${this._bay.shortId}]`);
    this._stateMachine.toSegregated();
    this.notify(Events.RESOURCE_SEGREGATED);
  }

  async destroy() {
    debug(`Dooming ${this.name} bay [${this._bay.shortId}]`);
    this._stateMachine.toDoomed();
    await this._bay.destroy();
  }

  abort() {
    debug(`Aborting resource validation in${this.name} bay [${this._bay.shortId}]`);
    this._bay.segregate();
    this.#validateResource.abort();
  }

  #onValidateSuccess() {
    debug(`Successfully validated resource in ${this.name} bay [${this._bay.shortId}]`);
    this._bay.validated(new Date());
    this._stateMachine.toReady();
    this.notify(Events.RESOURCE_VALIDATED);
  }

  #onValidateError({ error }) {
    debug(`Error validating resource in ${this.name} bay [${this._bay.shortId}]`, error);
    this.notify(Events.RESOURCE_VALIDATION_ERROR, { error });
    this._bay.segregate();
    this._bay.destroy();
  }

  #onValidateTimeout({ timeout }) {
    debug(`Timed out after ${timeout.toLocaleString()}ms validating resource in ${this.name} bay [${this._bay.shortId}]`);
    this.notify(Events.RESOURCE_VALIDATION_TIMEOUT, { timeout });
    this._bay.segregate();
  }

  #onBelatedValidateSuccess() {
    debug(`Belated success validating resource in ${this.name} bay [${this._bay.shortId}]`);
    this.notify(Events.RESOURCE_VALIDATED);
    this._bay.destroy();
  }

  #onBelatedValidateError = ({ error }) => {
    debug(`Belated error validating resource in ${this.name} bay [${this._bay.shortId}]`, error);
    this.notify(Events.RESOURCE_VALIDATION_ERROR, { error });
    this._bay.destroy();
  };
}

module.exports = UnvalidatedState;
