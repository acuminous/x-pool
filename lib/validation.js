const { ConfigurationError } = require('./Errors');

function validateFactory(factory) {
  if (!factory) throw new ConfigurationError('factory is a required option');
  if (typeof factory.create !== 'function') throw new ConfigurationError('The supplied factory is missing a create method');
  if (typeof factory.validate !== 'function') throw new ConfigurationError('The supplied factory is missing a validate method');
  if (typeof factory.destroy !== 'function') throw new ConfigurationError('The supplied factory is missing a destroy method');
  return factory;
}

function validateBoolean(name, options, mandatory) {
  const value = options[name];
  checkMandatory(name, value, mandatory) || checkType(name, value, 'boolean');
  return value;
}

function validateNumber(name, options, mandatory, minValue) {
  const value = options[name];
  checkMandatory(name, value, mandatory) || (checkType(name, value, 'number') && checkMinValue(name, value, minValue));
  return value;
}

function validateUpperBoundary(name1, name2, options) {
  const value1 = options[name1];
  const value2 = options[name2];
  if (typeof value1 !== 'number' || typeof value2 !== 'number') return;
  if (value1 > value2) throw new ConfigurationError(`The ${name1} option must be less than or equal to ${name2}`);
}

function checkMandatory(name, value, mandatory) {
  if (mandatory && (value === undefined || value === null)) throw new ConfigurationError(`${name} is a required option`);
  if (value === undefined || value === null) return true;
}

function checkType(name, value, type) {
  if (typeof value !== type) throw new ConfigurationError(`The ${name} option must be a ${type}`);
  return true;
}

function checkMinValue(name, value, minValue) {
  if (value < minValue) throw new ConfigurationError(`The ${name} option must be at least ${minValue}`);
  return true;
}

module.exports = {
  validateFactory,
  validateBoolean,
  validateNumber,
  validateUpperBoundary,
};
