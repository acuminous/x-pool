const NewState = require('./states/NewState');
const EmptyState = require('./states/EmptyState');
const ProvisionedState = require('./states/ProvisionedState');
const ReadyState = require('./states/ReadyState');
const IdleState = require('./states/IdleState');
const AcquiredState = require('./states/AcquiredState');
const ResetState = require('./states/ResetState');
const DoomedState = require('./states/DoomedState');
const DestroyedState = require('./states/DestroyedState');
const TimedoutState = require('./states/TimedoutState');
const ZombieState = require('./states/ZombieState');

class StateMachine {

  #stores;
  #commandFactory;
  #state;

  constructor(bay, stores, commandFactory) {
    this.#stores = stores;
    this.#commandFactory = commandFactory;
    this.#state = new NewState(this, this.#stores.initialising).accept(bay);
  }

  get state() {
    return this.#state;
  }

  toEmpty() {
    const empty = new EmptyState(this, this.#stores.initialising, this.#commandFactory.getCreateCommand());
    this.#state = this.#state.transition(empty);
    return this;
  }

  toProvisioned() {
    const provisioned = new ProvisionedState(this, this.#stores.initialising, this.#commandFactory.getValidateCommand());
    this.#state = this.#state.transition(provisioned);
    return this;
  }

  toReady() {
    const ready = new ReadyState(this, this.#stores.initialising);
    this.#state = this.#state.transition(ready);
    return this;
  }

  toIdle() {
    const idle = new IdleState(this, this.#stores.idle);
    this.#state = this.#state.transition(idle);
  }

  toAcquired() {
    const acquired = new AcquiredState(this, this.#stores.acquired, this.#commandFactory.getResetCommand());
    this.#state = this.#state.transition(acquired);
  }

  toReset() {
    const reset = new ResetState(this, this.#stores.reinstating);
    this.#state = this.#state.transition(reset);
  }

  toDoomed() {
    const doomed = new DoomedState(this, this.#stores.doomed, this.#commandFactory.getDestroyCommand());
    this.#state = this.#state.transition(doomed);
  }

  toDestroyed() {
    const destroyed = new DestroyedState(this, this.#stores.destroyed);
    this.#state = this.#state.transition(destroyed);
  }

  toTimedout() {
    const timedout = new TimedoutState(this, this.#stores.timedout);
    this.#state = this.#state.transition(timedout);
  }

  toZombie() {
    const zombie = new ZombieState(this, this.#stores.zombie);
    this.#state = this.#state.transition(zombie);
  }

}

module.exports = StateMachine;
