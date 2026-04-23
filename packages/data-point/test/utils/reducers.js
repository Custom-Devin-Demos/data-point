const _ = require("lodash");

const utils = require("../../lib/utils");

module.exports.passThrough = () => (value) => value;

module.exports.throwError = () => () => {
  throw new Error("unexpected");
};

// invalid in return type (should return function)
module.exports.invalidReducer = () => {
  // should had return a function
};

// invalid in arity, must be 2
module.exports.invalidReducerArity = () => () => {
  // return method should have acc and callback as arguments
};

module.exports.isEqualTo = (compareTo) => (value) => compareTo === value;

module.exports.addKeyValue = (key, val) => (value) =>
  utils.set(value, key, val);

module.exports.getKeyValue = (key) => (value) => _.get(value, key);

module.exports.addCollectionValues = () => (value) => value.reduce(_.add);

module.exports.timesArg1 = (factor) => (value) => value * factor;

module.exports.multiplyBy = module.exports.timesArg1;

module.exports.addString = (string) => (value) => value + string;

module.exports.useDataacc = () => (value, acc) =>
  value + acc.initialValue.itemPath;

module.exports.addQueryVar = (key, val) => (value) =>
  utils.set(value, `qs.${key}`, val);

module.exports.fromMetaToData = (key) => (value, acc) => {
  const initialValue = value;
  const val = _.get(acc, `params.${key}`);
  const result = utils.set(initialValue, key, val);
  return result;
};

module.exports.addStringFromMeta = (key) => (value, acc) => {
  const val = _.get(acc, `params.${key}`);
  return value + val;
};

module.exports.setDataFromRequest = (key) => (value, acc) => {
  const initialValue = value;
  const val = _.get(acc, `locals.${key}`);
  return utils.set(initialValue, key, val);
};

module.exports.addStringFromRequest = (key) => (value, acc) => {
  const val = _.get(acc, `locals.${key}`);
  return acc.value + val;
};

module.exports.sourceErrorDoNothing = () => (value) => value;

module.exports.sourceErrorGraceful = () => () => ({
  noData: true,
});

module.exports.addStringFromaccKey = (key) => (value, acc) => {
  const val = _.get(acc, key);
  return value + val;
};
