const EmptyState = require('./states/EmptyState');
const PendingState = require('./states/PendingState');
const UnvalidatedState = require('./states/UnvalidatedState');
const ReadyState = require('./states/ReadyState');
const IdleState = require('./states/IdleState');
const AcquiredState = require('./states/AcquiredState');
const DoomedState = require('./states/DoomedState');
const DestroyedState = require('./states/DestroyedState');
const SegregatedState = require('./states/SegregatedState');
const ZombieState = require('./states/ZombieState');

class StateMachine {

  #stores;
  #commandFactory;
  #state;

  constructor(bay, stores, commandFactory) {
    this.#stores = stores;
    this.#commandFactory = commandFactory;
    this.#state = new EmptyState(this, this.#stores.initialising).accept(bay);
  }

  get state() {
    return this.#state;
  }

  toPending() {
    const pending = new PendingState(this, this.#stores.initialising, this.#commandFactory.getCreateCommand());
    this.#state = this.#state.transition(pending);
    return this;
  }

  toUnvalidated() {
    const unvalidated = new UnvalidatedState(this, this.#stores.initialising, this.#commandFactory.getValidateCommand());
    this.#state = this.#state.transition(unvalidated);
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
    const acquired = new AcquiredState(this, this.#stores.acquired);
    this.#state = this.#state.transition(acquired);
  }

  toDoomed() {
    const doomed = new DoomedState(this, this.#stores.doomed, this.#commandFactory.getDestroyCommand());
    this.#state = this.#state.transition(doomed);
  }

  toDestroyed() {
    const destroyed = new DestroyedState(this, this.#stores.destroyed);
    this.#state = this.#state.transition(destroyed);
  }

  toSegregated() {
    const segregated = new SegregatedState(this, this.#stores.segregated);
    this.#state = this.#state.transition(segregated);
  }

  toZombie() {
    const zombie = new ZombieState(this, this.#stores.zombie);
    this.#state = this.#state.transition(zombie);
  }

}

module.exports = StateMachine;
