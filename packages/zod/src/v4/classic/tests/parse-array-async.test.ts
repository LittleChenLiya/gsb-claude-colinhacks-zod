import { expect, test } from "vitest";

import * as z from "zod/v4";

/** A promise whose settlement is controlled by the test. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Flush pending microtasks/macrotasks so already-settled gates propagate. */
const tick = () => new Promise<void>((res) => setTimeout(res, 0));

test("parseArrayAsync: out-of-order completion, in-order results, one run per item", async () => {
  const gates = [deferred<number>(), deferred<number>(), deferred<number>()];
  const runs = [0, 0, 0];
  const schema = z.number().transform(async (n) => {
    runs[n]!++;
    return gates[n]!.promise;
  });

  const promise = z.parseArrayAsync(schema, [0, 1, 2]);

  // every item's schema ran exactly once, before any gate settled
  expect(runs).toEqual([1, 1, 1]);

  // settle in reverse order: 2, 1, 0
  gates[2]!.resolve(20);
  await tick();
  gates[1]!.resolve(10);
  await tick();
  gates[0]!.resolve(0);

  // results come back in the original index order, not settlement order
  await expect(promise).resolves.toEqual([0, 10, 20]);
  expect(runs).toEqual([1, 1, 1]);
});

test("parseArrayAsync: failing item keeps its own index in the issue path", async () => {
  const gates = [deferred<number>(), deferred<number>(), deferred<number>()];
  const runs = [0, 0, 0];
  const schema = z
    .number()
    .transform(async (n) => {
      runs[n]!++;
      return gates[n]!.promise;
    })
    .refine((v) => v !== 10, "no tens");

  const promise = z.parseArrayAsync(schema, [0, 1, 2]);
  expect(runs).toEqual([1, 1, 1]);

  // reverse-order settlement; item 1 resolves to 10 and fails the refinement
  gates[2]!.resolve(20);
  await tick();
  gates[1]!.resolve(10);
  await tick();
  gates[0]!.resolve(0);

  const err = await promise.catch((e) => e);
  expect(err).toBeInstanceOf(z.ZodError);
  // the failure is reported at its original index — indices are not compressed
  expect(err.issues).toHaveLength(1);
  expect(err.issues[0].path).toEqual([1]);
  expect(runs).toEqual([1, 1, 1]);
});

test("parseArrayAsync: validation failure at index 1 has path [1]", async () => {
  const err = await z.parseArrayAsync(z.string(), ["a", 42, "c"]).catch((e) => e);
  expect(err).toBeInstanceOf(z.ZodError);
  expect(err.issues).toHaveLength(1);
  expect(err.issues[0].path).toEqual([1]);
});

test("safeParseArrayAsync: per-index results, failures do not compress indices", async () => {
  const gates = [deferred<string>(), deferred<string>(), deferred<string>()];
  const runs = [0, 0, 0];
  const schema = z
    .number()
    .transform(async (n) => {
      runs[n]!++;
      await gates[n]!.promise;
      return n * 10;
    })
    .refine((v) => v !== 10, "no tens");

  const promise = z.safeParseArrayAsync(schema, [0, 1, 2]);
  expect(runs).toEqual([1, 1, 1]);

  gates[2]!.resolve("c");
  await tick();
  gates[1]!.resolve("b");
  await tick();
  gates[0]!.resolve("a");

  const results = await promise;
  expect(results).toHaveLength(3);
  expect(results[0]).toMatchObject({ success: true, data: 0 });
  expect(results[2]).toMatchObject({ success: true, data: 20 });

  const failure = results[1]!;
  expect(failure.success).toBe(false);
  if (!failure.success) {
    expect(failure.error).toBeInstanceOf(z.ZodError);
    expect(failure.error.issues[0]!.path).toEqual([1]);
  }
  expect(runs).toEqual([1, 1, 1]);
});

test("parseArrayAsync: empty array", async () => {
  await expect(z.parseArrayAsync(z.string(), [])).resolves.toEqual([]);
  await expect(z.safeParseArrayAsync(z.string(), [])).resolves.toEqual([]);
});

test("example: batch-parse rows with one async schema", async () => {
  // fetch a remote label for each id; rows are parsed in parallel
  const labels: Record<number, string> = { 1: "one", 2: "two", 3: "three" };
  const row = z.number().transform(async (id) => ({ id, label: labels[id]! }));

  const rows = await z.parseArrayAsync(row, [1, 2, 3]);
  //    ^? { id: number; label: string }[]
  expect(rows).toEqual([
    { id: 1, label: "one" },
    { id: 2, label: "two" },
    { id: 3, label: "three" },
  ]);

  // per-row results without throwing; failures stay at their own index
  const results = await z.safeParseArrayAsync(row, [1, "nope", 3]);
  expect(results[0]!.success).toBe(true);
  expect(results[1]!.success).toBe(false);
  if (!results[1]!.success) expect(results[1]!.error.issues[0]!.path).toEqual([1]);
  expect(results[2]!.success).toBe(true);
});
