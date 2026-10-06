import { expect, test } from "vitest";

import * as z from "zod/v4";
import * as zm from "zod/mini";

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test("parseArrayAsync example", async () => {
  const [name, age] = await z.parseArrayAsync([z.string(), z.number()], ["alice", 30]);
  expect(name).toBe("alice");
  expect(age).toBe(30);
});

test("parseArrayAsync runs each schema once and keeps original order under reverse completion", async () => {
  const gates = [deferred(), deferred(), deferred()];
  const counts = [0, 0, 0];
  const makeSchema = (i: number) =>
    z.number().refine(async (v) => {
      counts[i]++;
      await gates[i].promise;
      return v % 10 === 0;
    });

  const promise = z.parseArrayAsync([makeSchema(0), makeSchema(1), makeSchema(2)], [10, 20, 30]);

  // all three items have started, each exactly once
  await tick();
  expect(counts).toEqual([1, 1, 1]);

  // settle in reverse order
  gates[2].resolve();
  await tick();
  gates[1].resolve();
  await tick();
  gates[0].resolve();

  const result = await promise;
  // results still follow the original indices
  expect(result).toEqual([10, 20, 30]);
  expect(counts).toEqual([1, 1, 1]);
});

test("parseArrayAsync reports the failing item under its original index", async () => {
  const err = await z.parseArrayAsync([z.string(), z.string(), z.string()], ["a", 42, "c"]).then(
    () => {
      throw new Error("expected parseArrayAsync to throw");
    },
    (e) => e
  );

  expect(err).toBeInstanceOf(z.ZodError);
  expect(err.issues).toHaveLength(1);
  expect(err.issues[0].path).toEqual([1]);
});

test("parseArrayAsync does not compress indices of failing items", async () => {
  const err = await z.parseArrayAsync([z.string(), z.string(), z.string()], [1, "b", 3]).then(
    () => {
      throw new Error("expected parseArrayAsync to throw");
    },
    (e) => e
  );

  expect(err).toBeInstanceOf(z.ZodError);
  expect(err.issues.map((iss: z.core.$ZodIssue) => iss.path)).toEqual([[0], [2]]);
});

test("parseArrayAsync prefixes nested issue paths with the item index", async () => {
  const err = await z
    .parseArrayAsync(
      [z.object({ name: z.string() }), z.object({ name: z.string() })],
      [{ name: "ok" }, { name: 42 }]
    )
    .then(
      () => {
        throw new Error("expected parseArrayAsync to throw");
      },
      (e) => e
    );

  expect(err).toBeInstanceOf(z.ZodError);
  expect(err.issues).toHaveLength(1);
  expect(err.issues[0].path).toEqual([1, "name"]);
});

test("parseArrayAsync waits for pending items before throwing and runs each once", async () => {
  const gates = [deferred(), deferred(), deferred()];
  const counts = [0, 0, 0];
  const makeSchema = (i: number, pass: boolean) =>
    z.number().refine(async () => {
      counts[i]++;
      await gates[i].promise;
      return pass;
    });

  const promise = z.parseArrayAsync(
    [makeSchema(0, true), makeSchema(1, false), makeSchema(2, true)],
    [10, 20, 30]
  );
  const assertion = expect(promise).rejects.toThrowError(z.ZodError);

  await tick();
  expect(counts).toEqual([1, 1, 1]);

  // the middle item fails, but only after every gate has settled
  gates[2].resolve();
  gates[0].resolve();
  gates[1].resolve();

  await assertion;
  expect(counts).toEqual([1, 1, 1]);

  const err = await promise.catch((e) => e);
  expect(err.issues.map((iss: z.core.$ZodIssue) => iss.path)).toEqual([[1]]);
});

test("parseArrayAsync is also exported from zod/mini", async () => {
  const result = await zm.parseArrayAsync([zm.string(), zm.number()], ["a", 1]);
  expect(result).toEqual(["a", 1]);
});
