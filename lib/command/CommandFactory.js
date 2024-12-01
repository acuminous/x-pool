const Command = require('./Command');

class CommandFactory {

  #pool;
  #config;

  constructor(pool, config) {
    this.#pool = pool;
    this.#config = config;
  }

  getCreateCommand() {
    return new Command('create resource', this.#pool, (...args) => this.#config.factory.create(...args), this.#config.createTimeout);
  }

  getDestroyCommand() {
    return new Command('destroy resource', this.#pool, (...args) => this.#config.factory.destroy(...args), this.#config.destroyTimeout);
  }

}

module.exports = CommandFactory;
