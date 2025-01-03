class EventListenerRegistry {

  #registry = new Map();

  add(event, listener) {
    const listeners = this.get(event);
    listeners.push(listener);
    this.#registry.set(event, listeners);
  }

  get(event) {
    return this.#registry.get(event) || [];
  }

  clear() {
    this.#registry.clear();
  }

  forEach(fn) {
    this.#registry.forEach((listeners, event) => fn(event, listeners));
  }

}

module.exports = EventListenerRegistry;
