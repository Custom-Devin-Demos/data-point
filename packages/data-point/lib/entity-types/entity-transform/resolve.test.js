/* eslint-env jest */

const resolveTransformEntity = require("./resolve").resolve;

describe("resolve", () => {
  test("should return acc as is", () =>
    expect(resolveTransformEntity({ value: 1 })).toEqual(1));
});
