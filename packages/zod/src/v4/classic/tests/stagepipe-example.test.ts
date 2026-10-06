import { expect, test } from "vitest";

import * as z from "zod/v4";

// Three-stage example: input validation -> transform -> output schema
// Stage 1 (input): z.string() validates the input is a string
// Stage 2 (transform): Number(val) converts the string to a number
// Stage 3 (output): z.number().min(10) validates the transformed value

test("three-stage example: string -> number -> min(10)", () => {
  const schema = z.stagePipe(
    z.string(),
    (val) => Number(val),
    z.number().min(10)
  );

  // Valid input: all three stages pass
  const valid = schema.safeParse("1234");
  expect(valid.success).toBe(true);
  if (valid.success) {
    expect(valid.data).toBe(1234);
  }

  // Output failure: input and transform pass, output min(10) fails
  const outputFail = schema.safeParse("5");
  expect(outputFail.success).toBe(false);
  if (!outputFail.success) {
    expect(outputFail.stage).toBe("output");
  }

  // Input failure: input validation fails, transform and output never run
  const inputFail = schema.safeParse(123);
  expect(inputFail.success).toBe(false);
  if (!inputFail.success) {
    expect(inputFail.stage).toBe("input");
  }
});

test("three-stage example: transform is called exactly once on valid input", () => {
  let transformCount = 0;
  const schema = z.stagePipe(
    z.string(),
    (val) => {
      transformCount++;
      return Number(val);
    },
    z.number().min(10)
  );

  schema.safeParse("1234");
  expect(transformCount).toBe(1);
});

test("three-stage example: transform is not called when input fails", () => {
  let transformCount = 0;
  const schema = z.stagePipe(
    z.string(),
    (val) => {
      transformCount++;
      return Number(val);
    },
    z.number().min(10)
  );

  schema.safeParse(123);
  expect(transformCount).toBe(0);
});
