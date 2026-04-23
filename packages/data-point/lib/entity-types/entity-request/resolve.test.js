/* eslint-env jest */

const _ = require("lodash");
const axios = require("axios");
const nock = require("nock");
let Resolve = require("./resolve");

const AccumulatorFactory = require("../../accumulator/factory");
const ReducerFactory = require("../../reducer-types/factory");

const ResolveEntity = require("../base-entity/resolve");

const FixtureStore = require("../../../test/utils/fixture-store");

const helpers = require("../../helpers");
let utils = require("../../utils");

let dataPoint;
let resolveReducerBound;

let locals;
let values;

function transform(entityId, value, options) {
  const reducer = dataPoint.entities.get(entityId);
  const accumulator = helpers.createAccumulator(value, {
    context: reducer,
    locals,
    values,
  });
  const acc = Object.assign({}, accumulator, options);
  return Resolve.resolve(acc, resolveReducerBound);
}

function helperMockContext(accumulatorData, reducerSource) {
  const accumulator = AccumulatorFactory.create({
    value: accumulatorData,
    locals,
    values,
  });
  const reducer = ReducerFactory.create(reducerSource);
  const entity = dataPoint.entities.get(reducer.id);
  return ResolveEntity.createCurrentAccumulator(accumulator, reducer, entity);
}

beforeAll(() => {
  locals = {
    itemPath: "/source1",
  };
  dataPoint = FixtureStore.create();
  resolveReducerBound = helpers.createReducerResolver(dataPoint);
  values = dataPoint.values.getStore();
});

beforeEach(() => {
  dataPoint.middleware.clear();
});

afterEach(() => {
  nock.cleanAll();
});

describe("resolveUrlInjections", () => {
  test("url with no reducer", () => {
    const value = {
      domain: "foo.com",
    };

    const currentAccumulator = helperMockContext(
      value,
      "request:a1",
      "request:a1",
    );

    const result = Resolve.resolveUrlInjections(
      "http://{value.domain}/api",
      currentAccumulator,
    );

    expect(result).toBe("http://foo.com/api");
  });
});

describe("resolveUrl", () => {
  test("It should get spec.url", () => {
    const result = Resolve.resolveUrl({
      reducer: {
        spec: {
          url: "http://foo",
        },
      },
    });
    expect(result).toBe("http://foo");
  });

  it("should fallback on acc.value when spec.url is not present", () => {
    const result = Resolve.resolveUrl({
      value: "http://fallback.com",
      reducer: {
        spec: {
          url: undefined,
        },
      },
    });
    expect(result).toBe("http://fallback.com");
  });

  it("should not fallback on acc.value if acc.value is empty", () => {
    const result = Resolve.resolveUrl({
      value: "",
      reducer: {
        spec: {
          url: undefined,
        },
      },
    });
    expect(result).toBe(undefined);
  });

  it("should return undefined if Request.url is empty and acc.value empty but both are strings", () => {
    const result = Resolve.resolveUrl({
      value: "",
      reducer: {
        spec: {
          url: "",
        },
      },
    });
    expect(result).toBe(undefined);
  });

  it("should return undefined when neither spec.url is present or value is string", () => {
    const result = Resolve.resolveUrl({
      value: {}, // not a string
      reducer: {
        spec: {
          url: undefined,
        },
      },
    });
    expect(result).toBe(undefined);
  });

  test("It should do injections", () => {
    const result = Resolve.resolveUrl({
      value: "bar",
      reducer: {
        spec: {
          url: "http://foo/{value}",
        },
      },
    });
    expect(result).toBe("http://foo/bar");
  });
});

describe("resolveOptions", () => {
  test("It should set acc.options", async () => {
    const acc = {
      value: {
        subdomain: "bar",
      },
      reducer: {
        spec: {
          url: "http://foo.com/{value.subdomain}",
          options: ReducerFactory.create({
            port: () => 80,
          }),
        },
      },
    };

    const result = await Resolve.resolveOptions(acc, resolveReducerBound);
    expect(result.options).toEqual({
      method: "GET",
      json: true,
      url: "http://foo.com/bar",
      port: 80,
    });
  });

  test("It should set acc.options and override defaults", async () => {
    const acc = {
      value: {
        method: "POST",
        testProp: 1,
        subdomain: "bar",
      },
      reducer: {
        spec: {
          url: "http://foo.com/{value.subdomain}",
          options: ReducerFactory.create({
            method: "$method",
            port: () => 80,
            qs: {
              testProp: "$testProp",
            },
          }),
        },
      },
    };

    const result = await Resolve.resolveOptions(acc, resolveReducerBound);
    expect(result.options).toEqual({
      method: "POST",
      json: true,
      port: 80,
      url: "http://foo.com/bar",
      qs: {
        testProp: 1,
      },
    });
  });
});

describe("getRequestOptions", () => {
  test("set defaults", () => {
    expect(Resolve.getRequestOptions("http://foo.com", {})).toEqual({
      method: "GET",
      json: true,
      url: "http://foo.com",
    });
    expect(
      Resolve.getRequestOptions("http://foo.com", {
        json: false,
      }),
    ).toEqual({
      method: "GET",
      json: false,
      url: "http://foo.com",
    });
    expect(
      Resolve.getRequestOptions("http://foo.com", {
        url: "http://foo.com/bar",
      }),
    ).toEqual({
      method: "GET",
      json: true,
      url: "http://foo.com/bar",
    });
    expect(
      Resolve.getRequestOptions("http://foo.com", {
        timeout: 100,
      }),
    ).toEqual({
      method: "GET",
      json: true,
      timeout: 100,
      url: "http://foo.com",
    });
    expect(
      Resolve.getRequestOptions("http://foo.com", { baseUrl: "BASE_URL" }),
    ).toEqual({
      method: "GET",
      json: true,
      baseUrl: "BASE_URL",
      uri: "http://foo.com",
      url: "",
    });
    expect(
      Resolve.getRequestOptions("http://foo.com", {
        baseUrl: "BASE_URL",
        uri: "URI",
      }),
    ).toEqual({
      method: "GET",
      json: true,
      baseUrl: "BASE_URL",
      uri: "URI",
      url: "",
    });
  });
});

describe("toAxiosConfig", () => {
  test("should convert qs to params", () => {
    const config = Resolve.toAxiosConfig({
      method: "GET",
      url: "http://example.com",
      qs: { foo: "bar" },
    });
    expect(config.params).toEqual({ foo: "bar" });
  });

  test("should convert body to data", () => {
    const config = Resolve.toAxiosConfig({
      method: "POST",
      url: "http://example.com",
      body: { key: "value" },
    });
    expect(config.data).toEqual({ key: "value" });
  });

  test("should convert timeout", () => {
    const config = Resolve.toAxiosConfig({
      method: "GET",
      url: "http://example.com",
      timeout: 5000,
    });
    expect(config.timeout).toBe(5000);
  });

  test("should use uri over url when baseUrl is set", () => {
    const config = Resolve.toAxiosConfig({
      method: "GET",
      url: "http://example.com",
      baseUrl: "http://base.com",
      uri: "/custom-path",
    });
    expect(config.baseURL).toBe("http://base.com");
    expect(config.url).toBe("/custom-path");
  });

  test("should fall back to url when baseUrl is set but uri is not", () => {
    const config = Resolve.toAxiosConfig({
      method: "GET",
      url: "http://example.com/path",
      baseUrl: "http://base.com",
    });
    expect(config.baseURL).toBe("http://base.com");
    expect(config.url).toBe("http://example.com/path");
  });

  test("should convert auth credentials", () => {
    const config = Resolve.toAxiosConfig({
      method: "GET",
      url: "http://example.com",
      auth: { user: "myuser", pass: "mypass" },
    });
    expect(config.auth).toEqual({
      username: "myuser",
      password: "mypass",
    });
  });

  test("should set responseType json when json is true", () => {
    const config = Resolve.toAxiosConfig({
      method: "GET",
      url: "http://example.com",
      json: true,
    });
    expect(config.responseType).toBe("json");
  });

  test("should not set responseType when json is not true", () => {
    const config = Resolve.toAxiosConfig({
      method: "GET",
      url: "http://example.com",
      json: false,
    });
    expect(config.responseType).toBeUndefined();
  });

  test("should default method to GET", () => {
    const config = Resolve.toAxiosConfig({
      url: "http://example.com",
    });
    expect(config.method).toBe("GET");
  });
});

describe("resolveRequest", () => {
  test("resolve reducer locals", async () => {
    nock("http://remote.test").get("/source1").reply(200, {
      ok: true,
    });

    const acc = {
      options: {
        json: true,
        url: "http://remote.test/source1",
      },
    };

    const result = await Resolve.resolveRequest(acc);
    expect(result).toEqual({
      ok: true,
    });
  });

  test("log errors when request fails", async () => {
    nock("http://remote.test").get("/source1").reply(404, "not found");

    const acc = {
      options: {
        json: true,
        url: "http://remote.test/source1",
      },
      value: "foo",
    };
    _.set(acc, "reducer.spec.id", "test:test");
    try {
      await Resolve.resolveRequest(acc);
      throw new Error("should have thrown");
    } catch (err) {
      expect(err.statusCode).toEqual(404);
      expect(err.message).toContain("Entity info:");
      expect(err.message).toContain("test:test");
    }
  });
});

describe("inspect", () => {
  let utilsInspectSpy;
  beforeEach(() => {
    // debugIdCounter is a local variable in
    // resolve.js, so this resets it to zero
    jest.resetModules();
    /* eslint-disable global-require */
    Resolve = require("./resolve");
    utils = require("../../utils");
    /* eslint-enable global-require */
    utilsInspectSpy = jest.spyOn(utils, "inspect").mockReturnValue(undefined);
  });
  afterEach(() => {
    utilsInspectSpy.mockClear();
  });
  afterAll(() => {
    utilsInspectSpy.mockRestore();
  });

  function createAcc({ inspect, method, body }) {
    return {
      value: "boomerang",
      options: {
        url: "http://remote.test",
        method: (method || "GET").toUpperCase(),
        body,
      },
      params: {
        inspect,
      },
      reducer: _.set({}, "spec.id", "test:test"),
    };
  }
  function createMockRequest(options) {
    const { statusCode, requestType } = options;
    const nockInstance = nock("http://remote.test");
    nockInstance[requestType]("/").reply(statusCode, { statusCode });
    return axios({
      method: requestType.toUpperCase(),
      url: "http://remote.test",
    });
  }

  test("It should ignore params.inspect and utils.inspect when params.inspect === undefined", async () => {
    const acc = createAcc({ inspect: undefined });
    const request = createMockRequest({ statusCode: 200, requestType: "get" });
    Resolve.inspect(acc, request);
    await expect(request).resolves.toBeTruthy();
    expect(utilsInspectSpy).not.toBeCalled();
  });
  test("It should ignore params.inspect and utils.inspect when params.inspect === false", async () => {
    const acc = createAcc({ inspect: false });
    const request = createMockRequest({ statusCode: 200, requestType: "get" });
    Resolve.inspect(acc, request);
    await expect(request).resolves.toBeTruthy();
    expect(utilsInspectSpy).not.toBeCalled();
  });
  test("It should execute utils.inspect when params.inspect === true", async () => {
    const acc = createAcc({ inspect: true });
    const request = createMockRequest({ statusCode: 200, requestType: "get" });
    Resolve.inspect(acc, request);
    await expect(request).resolves.toBeTruthy();
    expect(utilsInspectSpy).toBeCalledWith(
      acc,
      expect.objectContaining({
        options: acc.options,
        value: acc.value,
      }),
    );
  });
  test("It should execute params.inspect when axios.then is called", async () => {
    const acc = createAcc({
      inspect: jest.fn(() => {
        // This helps verify that _.attempt is used when calling inspect
        throw new Error();
      }),
    });
    const request = createMockRequest({
      statusCode: 200,
      requestType: "get",
    });
    Resolve.inspect(acc, request);
    await expect(request).resolves.toBeTruthy();
    expect(utilsInspectSpy).not.toBeCalled();
    expect(acc.params.inspect.mock.calls).toEqual([
      [
        acc,
        expect.objectContaining({
          debugId: 1,
          type: "request",
          method: "GET",
          uri: expect.stringMatching("http://remote.test"),
        }),
      ],
      [
        acc,
        expect.objectContaining({
          debugId: 1,
          statusCode: 200,
          type: "response",
        }),
      ],
    ]);
  });
  test("It should execute params.inspect when axios.catch is called", async () => {
    const acc = createAcc({
      inspect: jest.fn(() => {
        // This helps verify that _.attempt is used when calling inspect
        throw new Error();
      }),
    });
    const request = createMockRequest({
      statusCode: 404,
      requestType: "get",
    });
    Resolve.inspect(acc, request);
    await expect(request).rejects.toBeTruthy();
    expect(utilsInspectSpy).not.toBeCalled();
    expect(acc.params.inspect.mock.calls).toEqual([
      [
        acc,
        expect.objectContaining({
          debugId: 1,
          type: "request",
          method: "GET",
          uri: expect.stringMatching("http://remote.test"),
        }),
      ],
      [
        acc,
        expect.objectContaining({
          debugId: 1,
          statusCode: 404,
          type: "error",
        }),
      ],
    ]);
  });
  test("It should pass the body option to params.inspect", async () => {
    const bodyData = JSON.stringify({ test: true });
    const acc = createAcc({
      inspect: jest.fn(),
      method: "POST",
      body: bodyData,
    });
    const request = createMockRequest({
      statusCode: 200,
      requestType: "post",
    });
    Resolve.inspect(acc, request);
    await expect(request).resolves.toBeTruthy();
    const mockArguments = acc.params.inspect.mock.calls.slice(0, 2);
    expect(utilsInspectSpy).not.toBeCalled();
    expect(mockArguments).toEqual([
      [
        acc,
        expect.objectContaining({
          debugId: 1,
          type: "request",
          method: "POST",
          uri: expect.stringMatching("http://remote.test"),
          body: expect.stringMatching(bodyData),
        }),
      ],
      [
        acc,
        expect.objectContaining({
          debugId: 1,
          statusCode: 200,
          type: "response",
        }),
      ],
    ]);
  });
  test("It should use uri fallback when url is not set", async () => {
    const acc = {
      value: "boomerang",
      options: {
        uri: "http://remote.test/fallback",
        method: "GET",
      },
      params: {
        inspect: jest.fn(),
      },
      reducer: _.set({}, "spec.id", "test:test"),
    };
    const request = createMockRequest({ statusCode: 200, requestType: "get" });
    Resolve.inspect(acc, request);
    await expect(request).resolves.toBeTruthy();
    expect(acc.params.inspect.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        uri: "http://remote.test/fallback",
      }),
    );
  });
  test("It should use empty string when neither url nor uri is set", async () => {
    const acc = {
      value: "boomerang",
      options: {
        method: "GET",
      },
      params: {
        inspect: jest.fn(),
      },
      reducer: _.set({}, "spec.id", "test:test"),
    };
    const request = createMockRequest({ statusCode: 200, requestType: "get" });
    Resolve.inspect(acc, request);
    await expect(request).resolves.toBeTruthy();
    expect(acc.params.inspect.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        uri: "",
      }),
    );
  });
  test("It should default method to GET when not set", async () => {
    const acc = {
      value: "boomerang",
      options: {
        url: "http://remote.test",
      },
      params: {
        inspect: jest.fn(),
      },
      reducer: _.set({}, "spec.id", "test:test"),
    };
    const request = createMockRequest({ statusCode: 200, requestType: "get" });
    Resolve.inspect(acc, request);
    await expect(request).resolves.toBeTruthy();
    expect(acc.params.inspect.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        method: "GET",
      }),
    );
  });
  test("It should handle inspect error without response object", async () => {
    const acc = createAcc({
      inspect: jest.fn(),
    });
    const request = Promise.reject(new Error("Network Error"));
    Resolve.inspect(acc, request);
    await expect(request).rejects.toThrow("Network Error");
    // wait for catch handler to execute
    await new Promise((r) => {
      setTimeout(r, 10);
    });
    expect(acc.params.inspect.mock.calls[1][1]).toEqual(
      expect.objectContaining({
        type: "error",
        statusCode: undefined,
        headers: undefined,
      }),
    );
  });
  test("It should stringify object body", async () => {
    const bodyData = { test: true };
    const acc = {
      value: "boomerang",
      options: {
        url: "http://remote.test",
        method: "POST",
        body: bodyData,
      },
      params: {
        inspect: jest.fn(),
      },
      reducer: _.set({}, "spec.id", "test:test"),
    };
    const request = createMockRequest({
      statusCode: 200,
      requestType: "post",
    });
    Resolve.inspect(acc, request);
    await expect(request).resolves.toBeTruthy();
    expect(acc.params.inspect.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        body: JSON.stringify(bodyData),
      }),
    );
  });
  test("It should use incrementing debugId values", async () => {
    const executeRequest = async (resolveWithSuccess, expectedDebugId) => {
      const acc = createAcc({ inspect: jest.fn() });
      const request = createMockRequest({
        statusCode: resolveWithSuccess ? 200 : 404,
        requestType: "get",
      });
      Resolve.inspect(acc, request);
      if (resolveWithSuccess) {
        await expect(request).resolves.toBeTruthy();
      } else {
        await expect(request).rejects.toBeTruthy();
      }
      expect(utilsInspectSpy).not.toBeCalled();
      expect(acc.params.inspect.mock.calls).toEqual([
        [
          acc,
          expect.objectContaining({
            debugId: expectedDebugId,
          }),
        ],
        [
          acc,
          expect.objectContaining({
            debugId: expectedDebugId,
          }),
        ],
      ]);
    };
    await executeRequest(true, 1);
    await executeRequest(false, 2);
    await executeRequest(false, 3);
    await executeRequest(true, 4);
  });
});

describe("resolveRequest - network error", () => {
  test("should handle network error without response object", async () => {
    nock("http://remote.test").get("/source1").replyWithError("connect ECONNREFUSED");

    const acc = {
      options: {
        json: true,
        url: "http://remote.test/source1",
      },
      value: "foo",
    };
    _.set(acc, "reducer.spec.id", "test:test");
    try {
      await Resolve.resolveRequest(acc);
      throw new Error("should have thrown");
    } catch (err) {
      expect(err.statusCode).toBeUndefined();
      expect(err.body).toBeUndefined();
      expect(err.message).toContain("Entity info:");
    }
  });
});

describe("resolve", () => {
  test("simplest json call", async () => {
    nock("http://remote.test").get("/source1").reply(200, {
      ok: true,
    });

    const result = await transform("request:a1", null);
    expect(result).toEqual({
      ok: true,
    });
  });

  it("should use acc.value as url when request.url is not defined", async () => {
    nock("http://remote.test").get("/source1").reply(200, {
      ok: true,
    });

    const result = await transform("request:a3", "http://remote.test/source1");
    expect(result).toEqual({
      ok: true,
    });
  });

  test("interpolate data that's returned from the value lifecycle method", async () => {
    nock("http://remote.test").get("/source5").reply(200, {
      ok: true,
    });

    const result = await transform("request:a1.4", {
      source: "source5",
    });
    expect(result).toEqual({
      ok: true,
    });
  });

  test("url injections", async () => {
    nock("http://remote.test").get("/source1").reply(200, {
      ok: true,
    });

    const result = await transform("request:a1.0", {});
    expect(result).toEqual({
      ok: true,
    });
  });

  test("it should inject locals value with string template", async () => {
    nock("http://remote.test").get("/source1").reply(200, {
      ok: true,
    });

    const result = await transform(
      "request:a3.2",
      {},
      {
        locals: {
          itemPath: "/source1",
        },
      },
    );
    expect(result).toEqual({
      ok: true,
    });
  });

  test("it should use options.baseURL to create a request URL", async () => {
    nock("http://remote.test").get("/source1").reply(200, {
      ok: true,
    });

    const result = await transform("request:a4", {});
    expect(result).toEqual({
      ok: true,
    });
  });

  test("it should omit options.auth when encountering an error", async () => {
    nock("http://remote.test").get("/source1").reply(404);

    let error;
    try {
      await transform("request:a9", {});
    } catch (err) {
      error = err;
    }

    expect(error.statusCode).toEqual(404);
    expect(error.message).toContain("Entity info:");
    expect(error.message).toContain("request:a9");
    // credentials are still available in the raw error.options
    expect(error.options.auth).toEqual({
      user: "cool_user",
      pass: "super_secret!",
    });
  });
});
