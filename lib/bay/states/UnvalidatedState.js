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

  async release() {
    debug(`Releasing ${this.name} bay [${this._bay.shortId}]`);
    this._stateMachine.toIdle();
    this.notify(Events.RESOURCE_RELEASED);
  }

  segregate() {
    debug(`Segregating ${this.name} bay [${this._bay.shortId}]`);
    this._stateMachine.toSegregated();
    this.notify(Events.RESOURCE_SEGREGATED);
  }

  abort() {
    debug(`Aborting ${this.name} bay [${this._bay.shortId}]`);
    this._bay.segregate();
    this.#validateResource.abort();
  }

  #onValidateSuccess() {
    debug(`Successfully validated ${this.name} bay [${this._bay.shortId}]`);
    this._stateMachine.toReady();
    this.notify(Events.RESOURCE_VALIDATED);
  }

  #onValidateError({ error }) {
    debug(`Error validating ${this.name} bay [${this._bay.shortId}]`, error);
    this.notify(Events.RESOURCE_VALIDATION_ERROR, { error });
    this._bay.segregate();
    this._bay.destroy();
  }

  #onValidateTimeout({ timeout }) {
    debug(`Timed out after ${timeout.toLocaleString()}ms validating ${this.name} bay [${this._bay.shortId}]`);
    this.notify(Events.RESOURCE_VALIDATION_TIMEOUT, { timeout });
    this._bay.segregate();
  }

  #onBelatedValidateSuccess({ resource }) {
    debug(`Belated success validating ${this.name} bay [${this._bay.shortId}]`);
    this.notify(Events.RESOURCE_VALIDATED);
    this._bay.destroy();
  }

  #onBelatedValidateError = ({ error }) => {
    debug(`Belated error validating ${this.name} bay [${this._bay.shortId}]`, error);
    this.notify(Events.RESOURCE_VALIDATION_ERROR, { error });
    this._bay.destroy();
  };
}

module.exports = UnvalidatedState;
