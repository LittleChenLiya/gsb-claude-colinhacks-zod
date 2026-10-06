// Targeted Node tests for z.stagedPipe (stage receipts).
// Run from packages/zod/node-tests:
//   node --experimental-transform-types --test staged-pipe.test.mts
import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

register("./ts-loader.mjs", import.meta.url);
const z = await import("../src/v4/index.ts");

test("output-stage failure: string -> number, min fails, successors never run", () => {
  let transformCalls = 0;
  let successorCalls = 0;

  const chain = z
    .stagedPipe(z.string())
    .through((raw) => {
      transformCalls++;
      return Number(raw);
    }, z.number().min(5))
    .through((n) => {
      successorCalls++;
      return n * 2;
    }, z.number());

  const receipt = chain.run("3"); // 3 < 5: output schema of link 0 rejects it

  assert.equal(receipt.ok, false);
  assert.equal(receipt.stage, "output"); // marked as the output stage
  assert.equal(receipt.link, 0);
  assert.equal(transformCalls, 1);
  assert.equal(successorCalls, 0); // failing stage stops the chain
  assert.ok(receipt.issues.length > 0);
  assert.equal(receipt.issues[0]!.code, "too_small");
  // exactly three stage receipts: input ok, transform ok, output failed
  assert.deepEqual(
    receipt.receipts.map((r) => [r.stage, r.ok]),
    [
      ["input", true],
      ["transform", true],
      ["output", false],
    ]
  );
});

test("valid input succeeds and the transform runs exactly once", () => {
  let transformCalls = 0;

  const chain = z.stagedPipe(z.string()).through((raw) => {
    transformCalls++;
    return Number(raw);
  }, z.number().min(5));

  const receipt = chain.run("42");

  assert.equal(receipt.ok, true);
  assert.equal(receipt.value, 42);
  assert.equal(receipt.stage, "output");
  assert.equal(transformCalls, 1);
  assert.deepEqual(
    receipt.receipts.map((r) => r.stage),
    ["input", "transform", "output"]
  );
});

test("input-stage failure: transform and output never run", () => {
  let transformCalls = 0;

  const chain = z.stagedPipe(z.string()).through((raw) => {
    transformCalls++;
    return raw.length;
  }, z.number());

  const receipt = chain.run(123);

  assert.equal(receipt.ok, false);
  assert.equal(receipt.stage, "input");
  assert.equal(receipt.link, null);
  assert.equal(transformCalls, 0);
  assert.ok(receipt.issues.length > 0);
  assert.deepEqual(
    receipt.receipts.map((r) => r.stage),
    ["input"]
  );
});

test("transform-stage failure: a throwing transform stops before output validation", () => {
  const boom = new Error("boom");

  const chain = z.stagedPipe(z.string()).through((_raw) => {
    throw boom;
  }, z.number());

  const receipt = chain.run("anything");

  assert.equal(receipt.ok, false);
  assert.equal(receipt.stage, "transform");
  assert.equal(receipt.link, 0);
  assert.equal(receipt.error, boom);
  assert.deepEqual(
    receipt.receipts.map((r) => r.stage),
    ["input", "transform"]
  );
});

test("transform output must pass output validation, not just the transform itself", () => {
  // The transform returns a string; the output schema demands a number.
  const chain = z.stagedPipe(z.string()).through((raw) => raw, z.number());

  const receipt = chain.run("not-a-number");

  assert.equal(receipt.ok, false);
  assert.equal(receipt.stage, "output");
  assert.equal(receipt.issues[0]!.code, "invalid_type");
});

test("regular z.pipe is preserved", () => {
  const pipe = z.string().pipe(z.string().min(2));

  assert.equal(pipe.safeParse("ab").success, true);
  assert.equal(pipe.safeParse("a").success, false);

  const codec = z.codec(z.string(), z.number(), {
    decode: (s) => Number(s),
    encode: (n) => String(n),
  });
  assert.equal(codec.safeParse("7").success, true);
});
