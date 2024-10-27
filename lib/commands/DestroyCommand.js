const TimeLimit = require('../utils/TimeLimit');

class DestroyCommand {

  #pool;
  #factory;
  #timeout;

  constructor(pool, factory, timeout) {
    this.#pool = pool
    this.#factory = factory;
    this.#timeout = timeout;
  }

  async execute(resource, onEventualSuccess) {
    const limit = new TimeLimit('destroy resource', this.#timeout);

    const destroy = new Promise((resolve, reject) => {
      return this.#factory.destroy(resource, this.#pool)
        .then(() => {
          onEventualSuccess();
          resolve();
        }).catch(reject);
    })

    await limit.restrict(destroy);
  }
}

module.exports = DestroyCommand;
