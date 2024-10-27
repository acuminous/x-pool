const TimeLimit = require('../utils/TimeLimit');

class CreateCommand {

  #pool;
  #factory;
  #timeout;

  constructor(pool, factory, timeout) {
    this.#pool = pool
    this.#factory = factory;
    this.#timeout = timeout;
  }

  async execute(onEventualSuccess, onEventualError) {
    const limit = new TimeLimit('create resource', this.#timeout);

    const create = new Promise((resolve, reject) => {
      return this.#factory.create(this.#pool)
        .then((resource) => {
          onEventualSuccess(resource);
          resolve(resource);
        }).catch((err) => {
          onEventualError(err);
          reject(err);
        });
    })

    return limit.restrict(create);
  }
}

module.exports = CreateCommand;
