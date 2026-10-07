import { expect, expectTypeOf, test } from "vitest";
import { z } from "zod/v4";

test("shared factory: one evaluation per parse, independent copies per field", () => {
  let calls = 0;
  const factory = () => ({ tags: [] as string[], seq: ++calls });
  const row = z.object({ tags: z.array(z.string()), seq: z.number() });
  const schema = z.object({
    a: row.defaultSession("shared", factory),
    b: row.defaultSession("shared", factory),
  });

  // one parse evaluates the shared factory exactly once
  const first = schema.parse({});
  expect(calls).toBe(1);
  expect(first.a).toEqual({ tags: [], seq: 1 });
  expect(first.b).toEqual({ tags: [], seq: 1 });

  // the two fields hold independent JSON copies, not shared references
  expect(first.a).not.toBe(first.b);
  expect(first.a.tags).not.toBe(first.b.tags);
  first.a.tags.push("mutated");
  first.a.seq = 999;
  expect(first.b).toEqual({ tags: [], seq: 1 });

  // the next parse re-evaluates the factory
  const second = schema.parse({});
  expect(calls).toBe(2);
  expect(second.a).toEqual({ tags: [], seq: 2 });
  expect(second.b).toEqual({ tags: [], seq: 2 });
});

test("top-level z.defaultSession combinator", () => {
  let calls = 0;
  const schema = z.object({
    a: z.defaultSession(z.object({ n: z.number() }), "combo", () => ({ n: ++calls })),
    b: z.defaultSession(z.object({ n: z.number() }), "combo", () => ({ n: ++calls })),
  });
  const out = schema.parse({});
  expect(calls).toBe(1);
  expect(out.a).toEqual({ n: 1 });
  expect(out.b).toEqual({ n: 1 });
  expect(out.a).not.toBe(out.b);
});

test("distinct factory IDs are evaluated independently", () => {
  let callsA = 0;
  let callsB = 0;
  const schema = z.object({
    a: z.string().defaultSession("id-a", () => `a${++callsA}`),
    b: z.string().defaultSession("id-b", () => `b${++callsB}`),
  });
  expect(schema.parse({})).toEqual({ a: "a1", b: "b1" });
  expect(callsA).toBe(1);
  expect(callsB).toBe(1);
});

test("factory is lazy: not called when every field is present in the input", () => {
  let calls = 0;
  const schema = z.object({
    a: z.string().defaultSession("lazy", () => `v${++calls}`),
    b: z.string().defaultSession("lazy", () => `v${++calls}`),
  });
  expect(schema.parse({ a: "x", b: "y" })).toEqual({ a: "x", b: "y" });
  expect(calls).toBe(0);
});

test("failing factory rejects before any transform runs", () => {
  let transforms = 0;
  const schema = z
    .object({
      a: z.string().defaultSession("boom", () => {
        throw new Error("factory exploded");
      }),
    })
    .transform((val) => {
      transforms++;
      return val;
    });

  expect(() => schema.parse({})).toThrow(z.ZodError);
  expect(transforms).toBe(0);

  const result = schema.safeParse({});
  expect(result.success).toBe(false);
  expect(transforms).toBe(0);
  if (!result.success) {
    expect(result.error.issues[0].code).toBe("custom");
    expect(result.error.issues[0].message).toContain("boom");
    expect(result.error.issues[0].message).toContain("factory exploded");
  }
});

test("circular default value rejects before any transform runs", () => {
  let transforms = 0;
  const circular: any = { name: "loop" };
  circular.self = circular;
  const schema = z
    .object({
      a: z.record(z.string(), z.any()).defaultSession("circ", () => circular),
    })
    .transform((val) => {
      transforms++;
      return val;
    });

  const result = schema.safeParse({});
  expect(result.success).toBe(false);
  expect(transforms).toBe(0);
  if (!result.success) {
    expect(result.error.issues[0].message).toContain("circ");
  }
});

test("circular factory re-entry within one parse session rejects", () => {
  // one parse session = one shared session map; seeding it on the context lets the
  // re-entrant parse below join the same session instead of starting a fresh one
  const ctx: z.core.ParseContextInternal<z.core.$ZodIssue> = { defaultFactorySession: new Map() };

  const schema: z.ZodType<{ a: string }> = z.object({
    a: z.string().defaultSession("rec", () => {
      z.core.parse(schema, {}, ctx);
      return "unreachable";
    }),
  });

  expect(() => z.core.parse(schema, {}, ctx)).toThrow(z.core.$ZodRealError);
});

test("session works with parseAsync", async () => {
  let calls = 0;
  const schema = z.object({
    a: z.string().defaultSession("async-session", () => `v${++calls}`),
    b: z.string().defaultSession("async-session", () => `v${++calls}`),
  });
  const result = await schema.parseAsync({});
  expect(result).toEqual({ a: "v1", b: "v1" });
  expect(calls).toBe(1);
});

test("existing .default() factory semantics are unchanged (evaluated per field)", () => {
  let calls = 0;
  const schema = z.object({
    a: z.string().default(() => `d${++calls}`),
    b: z.string().default(() => `d${++calls}`),
  });
  expect(schema.parse({})).toEqual({ a: "d1", b: "d2" });
  expect(calls).toBe(2);
});

test("defaultSession output typing", () => {
  const schema = z.object({
    a: z.string().defaultSession("typed", () => "hi"),
  });
  expectTypeOf<z.output<typeof schema>>().toEqualTypeOf<{ a: string }>();
  expectTypeOf<z.input<typeof schema>>().toEqualTypeOf<{ a?: string | undefined }>();
  expect(schema._zod.def.shape.a.unwrap()._zod.def.type).toBe("string");
});
