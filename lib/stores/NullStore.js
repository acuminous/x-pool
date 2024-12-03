const { inspect } = require('node:util');

class NullStore {

  #name;

  constructor(name) {
    this.#name = name;
  }

  get name() {
    return this.#name;
  }

  get size() {
    return 0;
  }

  peek() {}

  accept() {}

  add() {}

  remove() {}

  move() {}

  transfer() {}

  map(cb) {
    return [];
  }

  forEach(cb) {}

  find(cb) {}

  [inspect.custom]() {
    return `${this.constructor.name} { name: ${this.name}, size: ${this.size} }`;
  }
}

module.exports = NullStore;
