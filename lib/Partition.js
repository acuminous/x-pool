const { inspect } = require('node:util');

class List {

  #name;
  #list = new Array();

  constructor(name) {
    this.#name = name;
  }

  get name() {
    return this.#name;
  }

  get size() {
    return this.#list.length;
  }

  peak() {
    return this.#list[0];
  }

  accept(item) {
    this.#list.push(item);
  }

  move(item, destination) {
    this.remove(item);
    destination.accept(item);
  }

  remove(item) {
    const index = this.#getIndex(item);
    this.#removeAt(index);
  }

  map(cb) {
    return [...this.#list].map(cb);
  }

  forEach(cb) {
    [...this.#list].forEach(cb);
  }

  find(cb) {
    return [...this.#list].find(cb);
  }

  #getIndex(item) {
    const index = this.#list.findIndex(i => i === item);
    if (index === -1) throw new Error('Item not found');
    return index;
  }

  #removeAt(index) {
    this.#list.splice(index, 1);
  }

  [inspect.custom]() {
    return `${this.constructor.name} { name: ${this.name}, size: ${this.size} }`
  }
}

module.exports = List
