import { expect, test } from "vitest";

import * as z from "zod/v4";

test("stage pipe: output min failure marked as output stage", () => {
  const schema = z.stagePipe(
    z.string(),
    (val) => Number(val),
    z.number().min(10)
  );

  const result = schema.safeParse("5");
  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.stage).toBe("output");
  }
});

test("stage pipe: valid input succeeds, transform called once", () => {
  let transformCount = 0;
  const schema = z.stagePipe(
    z.string(),
    (val) => {
      transformCount++;
      return Number(val);
    },
    z.number().min(10)
  );

  const result = schema.safeParse("1234");
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data).toBe(1234);
  }
  expect(transformCount).toBe(1);
});

test("stage pipe: input validation failure stops transform, stage is input", () => {
  let transformCount = 0;
  const schema = z.stagePipe(
    z.string().min(5),
    (val) => {
      transformCount++;
      return Number(val);
    },
    z.number().min(10)
  );

  const result = schema.safeParse("abc");
  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.stage).toBe("input");
  }
  expect(transformCount).toBe(0);
});

test("stage pipe: transform return value goes through output validation", () => {
  let transformCount = 0;
  const schema = z.stagePipe(
    z.string(),
    (val) => {
      transformCount++;
      return Number(val);
    },
    z.number().min(10)
  );

  // "5" passes input validation, transform returns 5, but output min(10) fails
  const result = schema.safeParse("5");
  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.stage).toBe("output");
  }
  expect(transformCount).toBe(1);
});
