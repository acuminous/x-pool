const { ConfigurationError } = require('./Errors');

function validateFactory(factory) {
  if (!factory) throw new ConfigurationError('factory is a required option');
  if (typeof factory.create !== 'function') throw new ConfigurationError('The supplied factory is missing a create method');
  if (typeof factory.validate !== 'function') throw new ConfigurationError('The supplied factory is missing a validate method');
  if (typeof factory.destroy !== 'function') throw new ConfigurationError('The supplied factory is missing a destroy method');
  return factory;
}

function validateNumber(name, options, mandatory, minValue) {
  const value = options[name];
  if (mandatory && (value === undefined || value === null)) throw new ConfigurationError(`${name} is a required option`);
  if (value === undefined || value === null) return;
  if (typeof value !== 'number') throw new ConfigurationError(`The ${name} option must be a number`);
  if (value < minValue) throw new ConfigurationError(`The ${name} option must be at least ${minValue}`);
  return value;
}

module.exports = {
  validateFactory,
  validateNumber,
};
