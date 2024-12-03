const { inspect } = require('node:util');

class SingleItemStore {

  #name;
  #item;

  constructor(name) {
    this.#name = name;
  }

  get name() {
    return this.#name;
  }

  get size() {
    return this.#item === undefined ? 1 : 0;
  }

  peek() {
    return this.#item;
  }

  accept(item) {
    if (this.#item !== undefined) throw new Error(`Can only add one item to ${this.name} store`);
    this.#item = item;
  }

  add(item) {
    if (this.#item !== undefined) throw new Error(`Can only add one item to ${this.name} store`);
    this.#item = item;
  }

  remove(item) {
    if (this.#item !== item) throw new Error(`Item not found in ${this.name} store`);
    this.#item = undefined;
  }

  move(item, destination) {
    this.remove(item);
    destination.accept(item);
  }

  transfer(item, destination) {
    if (destination === this) return;
    this.remove(item);
    destination.add(item);
  }

  map(cb) {
    throw new Error(`Cannot iterate over a single item in ${this.name} store`);
  }

  forEach(cb) {
    throw new Error(`Cannot iterate over a single item in ${this.name} store`);
  }

  find(cb) {
		throw new Error(`Cannot iterate over a single item in ${this.name} store`);
  }

  [inspect.custom]() {
    return `${this.constructor.name} { name: ${this.name}, size: ${this.size} }`;
  }
}

module.exports = SingleItemStore;
