const _ = require("lodash");
const fp = require("lodash/fp");
const axios = require("axios");

const utils = require("../../utils");

let debugIdCounter = 0;

/**
 * request's default options
 * @type {Object}
 */
const REQUEST_DEFAULT_OPTIONS = {
  method: "GET",
  json: true
};

/**
 * @param {string} url
 * @param {Object} specOptions
 * @return {Object}
 */
function getRequestOptions(url, specOptions) {
  const options = _.defaults({}, specOptions, REQUEST_DEFAULT_OPTIONS);
  // this makes it possible to modify
  // the url in the options reducer
  options.url = options.url || url;
  if (options.baseUrl) {
    options.uri = options.uri || options.url;
    options.url = "";
  }

  return options;
}

module.exports.getRequestOptions = getRequestOptions;

/**
 * @param {string} url
 * @param {Accumulator} acc
 * @return {string}
 */
function resolveUrlInjections(url, acc) {
  const matches = url.match(/\{(.*?)\}/g) || [];
  const injectedUrl = matches.reduce((replacementTarget, match) => {
    const objPath = match.slice(1, -1);
    const value = _.get(acc, objPath, "");
    return replacementTarget.replace(match, value);
  }, url);

  return injectedUrl;
}

module.exports.resolveUrlInjections = resolveUrlInjections;

/**
 * @param {Accumulator} acc
 * @return {Accumulator}
 */
function resolveUrl(acc) {
  let urlToResolve = acc.reducer.spec.url;

  // use acc.value when Request.url is not set
  if (!urlToResolve && typeof acc.value === "string" && acc.value) {
    urlToResolve = acc.value;
  }

  // prevent from executing resolveUrlInjections when
  // urlToResolve is empty string
  return urlToResolve && typeof urlToResolve === "string"
    ? resolveUrlInjections(urlToResolve, acc)
    : undefined;
}

module.exports.resolveUrl = resolveUrl;

/**
 * Resolve options object
 * @param {Accumulator} accumulator
 * @param {Function} resolveReducer
 * @return {Promise<Accumulator>}
 */
async function resolveOptions(accumulator, resolveReducer) {
  const url = resolveUrl(accumulator);
  const specOptions = accumulator.reducer.spec.options;
  const value = await resolveReducer(accumulator, specOptions);
  const options = getRequestOptions(url, value);
  return utils.assign(accumulator, { options });
}

module.exports.resolveOptions = resolveOptions;

/**
 * Convert internal options format to axios config
 * @param {Object} options
 * @return {Object}
 */
function toAxiosConfig(options) {
  const config = {
    method: options.method || "GET",
    url: options.url,
    headers: options.headers
  };

  if (options.baseUrl) {
    config.baseURL = options.baseUrl;
    config.url = options.uri || options.url;
  }

  if (options.qs) {
    config.params = options.qs;
  }

  if (options.body) {
    config.data = options.body;
  }

  if (options.auth) {
    config.auth = {
      username: options.auth.user,
      password: options.auth.pass
    };
  }

  if (options.timeout) {
    config.timeout = options.timeout;
  }

  if (options.json === true) {
    config.responseType = "json";
  }

  return config;
}

module.exports.toAxiosConfig = toAxiosConfig;

/**
 * @param {Accumulator} acc
 * @param {Object} axiosRequest - axios promise
 */
function inspect(acc, axiosRequest) {
  const paramInspect = acc.params && acc.params.inspect;
  if (paramInspect === true) {
    utils.inspect(acc, {
      options: acc.options,
      value: acc.value
    });
    return true;
  }

  if (typeof paramInspect === "function") {
    debugIdCounter += 1;
    const debugId = debugIdCounter;
    const data = {
      debugId,
      type: "request",
      uri: acc.options.url || acc.options.uri || "",
      method: (acc.options.method || "GET").toUpperCase(),
      headers: _.cloneDeep(acc.options.headers || {})
    };
    if (acc.options.body) {
      data.body =
        typeof acc.options.body === "string"
          ? acc.options.body
          : JSON.stringify(acc.options.body);
    }
    _.attempt(paramInspect, acc, data);
    axiosRequest
      .then(res => {
        _.attempt(paramInspect, acc, {
          debugId,
          type: "response",
          statusCode: res.status,
          headers: res.headers
        });
      })
      .catch(error => {
        const statusCode = error.response ? error.response.status : undefined;
        _.attempt(paramInspect, acc, {
          debugId,
          type: "error",
          statusCode,
          headers: error.response ? error.response.headers : undefined
        });
      });
    return true;
  }

  return false;
}

module.exports.inspect = inspect;

/**
 * @param {Accumulator} acc
 * @param {Function} resolveReducer
 * @return {Promise<Accumulator>}
 */
async function resolveRequest(acc) {
  const axiosConfig = toAxiosConfig(acc.options);

  try {
    const request = axios(axiosConfig);
    inspect(acc, request);

    const response = await request;
    return response.data;
  } catch (error) {
    const statusCode = error.response ? error.response.status : undefined;
    const responseBody = error.response ? error.response.data : undefined;

    // remove auth objects from acc for printing to console
    const redactedAcc = fp.set("options.auth", "[omitted]", acc);

    const errorForDisplay = {
      message: error.message,
      statusCode,
      options: Object.assign({}, acc.options, { auth: "[omitted]" }),
      body: responseBody
    };

    const message = [
      "Entity info:",
      "\n  - Id: ",
      _.get(redactedAcc, "reducer.spec.id"),
      "\n",
      utils.inspectProperties(
        redactedAcc,
        ["options", "params", "value"],
        "  "
      ),
      "\n  Request:\n",
      utils.inspectProperties(
        errorForDisplay,
        ["error", "message", "statusCode", "options", "body"],
        "  "
      )
    ].join("");

    // preserve statusCode on the error for downstream consumers
    error.statusCode = statusCode;
    // preserve original options with auth for error handlers
    error.options = acc.options;
    error.body = responseBody;

    // attaching to error so it can be exposed by a handler outside datapoint
    // eslint-disable-next-line no-param-reassign
    error.message = `${error.message}\n\n${message}`;
    throw error;
  }
}

module.exports.resolveRequest = resolveRequest;

/**
 * @param {Accumulator} acc
 * @param {Function} resolveReducer
 * @return {Promise<Accumulator>}
 */
async function resolve(acc, resolveReducer) {
  const itemContext = await resolveOptions(acc, resolveReducer);
  return resolveRequest(itemContext, resolveReducer);
}

module.exports.resolve = resolve;
