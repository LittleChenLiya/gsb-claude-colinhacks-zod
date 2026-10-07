import { expect, expectTypeOf, test } from "vitest";
import { z } from "zod/v4";

test("basic defaults", () => {
  expect(z.string().default("default").parse(undefined)).toBe("default");
});

test("default with optional", () => {
  const schema = z.string().optional().default("default");
  expect(schema.parse(undefined)).toBe("default");
  expect(schema.unwrap().parse(undefined)).toBe(undefined);
});

test("default with transform", () => {
  const stringWithDefault = z
    .string()
    .transform((val) => val.toUpperCase())
    .default("default");
  expect(stringWithDefault.parse(undefined)).toBe("default");
  expect(stringWithDefault).toBeInstanceOf(z.ZodDefault);
  expect(stringWithDefault.unwrap()).toBeInstanceOf(z.ZodPipe);
  expect(stringWithDefault.unwrap().in).toBeInstanceOf(z.ZodString);
  expect(stringWithDefault.unwrap().out).toBeInstanceOf(z.ZodTransform);

  type inp = z.input<typeof stringWithDefault>;
  expectTypeOf<inp>().toEqualTypeOf<string | undefined>();
  type out = z.output<typeof stringWithDefault>;
  expectTypeOf<out>().toEqualTypeOf<string>();
});

test("default on existing optional", () => {
  const stringWithDefault = z.string().optional().default("asdf");
  expect(stringWithDefault.parse(undefined)).toBe("asdf");
  expect(stringWithDefault).toBeInstanceOf(z.ZodDefault);
  expect(stringWithDefault.unwrap()).toBeInstanceOf(z.ZodOptional);
  expect(stringWithDefault.unwrap().unwrap()).toBeInstanceOf(z.ZodString);

  type inp = z.input<typeof stringWithDefault>;
  expectTypeOf<inp>().toEqualTypeOf<string | undefined>();
  type out = z.output<typeof stringWithDefault>;
  expectTypeOf<out>().toEqualTypeOf<string>();
});

test("optional on default", () => {
  const stringWithDefault = z.string().default("asdf").optional();

  type inp = z.input<typeof stringWithDefault>;
  expectTypeOf<inp>().toEqualTypeOf<string | undefined>();
  type out = z.output<typeof stringWithDefault>;
  expectTypeOf<out>().toEqualTypeOf<string | undefined>();

  expect(stringWithDefault.parse(undefined)).toBe("asdf");
});

// test("complex chain example", () => {
//   const complex = z
//     .string()
//     .default("asdf")
//     .transform((val) => val.toUpperCase())
//     .default("qwer")
//     .unwrap()
//     .optional()
//     .default("asdfasdf");

//   expect(complex.parse(undefined)).toBe("asdfasdf");
// });

test("removeDefault", () => {
  const stringWithRemovedDefault = z.string().default("asdf").removeDefault();

  type out = z.output<typeof stringWithRemovedDefault>;
  expectTypeOf<out>().toEqualTypeOf<string>();
});

test("apply default at output", () => {
  const schema = z
    .string()
    .transform((_) => (Math.random() > 0 ? undefined : _))
    .default("asdf");
  expect(schema.parse("")).toEqual("asdf");
});

test("nested", () => {
  const inner = z.string().default("asdf");
  const outer = z.object({ inner }).default({
    inner: "qwer",
  });
  type input = z.input<typeof outer>;
  expectTypeOf<input>().toEqualTypeOf<{ inner?: string | undefined } | undefined>();
  type out = z.output<typeof outer>;
  expectTypeOf<out>().toEqualTypeOf<{ inner: string }>();
  expect(outer.parse(undefined)).toEqual({ inner: "qwer" });
  expect(outer.parse({})).toEqual({ inner: "asdf" });
  expect(outer.parse({ inner: undefined })).toEqual({ inner: "asdf" });
});

test("chained defaults", () => {
  const stringWithDefault = z.string().default("inner").default("outer");
  const result = stringWithDefault.parse(undefined);
  expect(result).toEqual("outer");
});

test("object optionality", () => {
  const schema = z.object({
    hi: z.string().default("hi"),
  });
  type schemaInput = z.input<typeof schema>;
  type schemaOutput = z.output<typeof schema>;
  expectTypeOf<schemaInput>().toEqualTypeOf<{ hi?: string | undefined }>();
  expectTypeOf<schemaOutput>().toEqualTypeOf<{ hi: string }>();
  expect(schema.parse({})).toEqual({
    hi: "hi",
  });
});

test("nested prefault/default", () => {
  const a = z
    .string()
    .default("a")
    .refine((val) => val.startsWith("a"));
  const b = z
    .string()
    .refine((val) => val.startsWith("b"))
    .default("b");
  const c = z
    .string()
    .prefault("c")
    .refine((val) => val.startsWith("c"));
  const d = z
    .string()
    .refine((val) => val.startsWith("d"))
    .prefault("d");

  const obj = z.object({
    a,
    b,
    c,
    d,
  });

  expect(obj.safeParse({ a: "a1", b: "b1", c: "c1", d: "d1" })).toMatchInlineSnapshot(`
    {
      "data": {
        "a": "a1",
        "b": "b1",
        "c": "c1",
        "d": "d1",
      },
      "success": true,
    }
  `);

  expect(obj.safeParse({ a: "f", b: "f", c: "f", d: "f" })).toMatchInlineSnapshot(`
    {
      "error": [ZodError: [
      {
        "code": "custom",
        "path": [
          "a"
        ],
        "message": "Invalid input"
      },
      {
        "code": "custom",
        "path": [
          "b"
        ],
        "message": "Invalid input"
      },
      {
        "code": "custom",
        "path": [
          "c"
        ],
        "message": "Invalid input"
      },
      {
        "code": "custom",
        "path": [
          "d"
        ],
        "message": "Invalid input"
      }
    ]],
      "success": false,
    }
  `);

  expect(obj.safeParse({})).toMatchInlineSnapshot(`
    {
      "data": {
        "a": "a",
        "b": "b",
        "c": "c",
        "d": "d",
      },
      "success": true,
    }
  `);

  expect(obj.safeParse({ a: undefined, b: undefined, c: undefined, d: undefined })).toMatchInlineSnapshot(`
    {
      "data": {
        "a": "a",
        "b": "b",
        "c": "c",
        "d": "d",
      },
      "success": true,
    }
  `);

  const obj2 = z.object({
    a: a.optional(),
    b: b.optional(),
    c: c.optional(),
    d: d.optional(),
  });
  expect(obj2.safeParse({ a: undefined, b: undefined, c: undefined, d: undefined })).toMatchInlineSnapshot(`
    {
      "data": {
        "a": "a",
        "b": "b",
        "c": "c",
        "d": "d",
      },
      "success": true,
    }
  `);

  expect(a.parse(undefined)).toBe("a");
  expect(b.parse(undefined)).toBe("b");
  expect(c.parse(undefined)).toBe("c");
  expect(d.parse(undefined)).toBe("d");
});

test("failing default", () => {
  const a = z
    .string()
    .default("z")
    .refine((val) => val.startsWith("a"));
  const b = z
    .string()
    .refine((val) => val.startsWith("b"))
    .default("z");
  const c = z
    .string()
    .prefault("z")
    .refine((val) => val.startsWith("c"));
  const d = z
    .string()
    .refine((val) => val.startsWith("d"))
    .prefault("z");

  const obj = z.object({
    a,
    b,
    c,
    d,
  });

  expect(
    obj.safeParse({
      a: undefined,
      b: undefined,
      c: undefined,
      d: undefined,
    }).error!.issues
  ).toMatchInlineSnapshot(`
    [
      {
        "code": "custom",
        "message": "Invalid input",
        "path": [
          "a",
        ],
      },
      {
        "code": "custom",
        "message": "Invalid input",
        "path": [
          "c",
        ],
      },
      {
        "code": "custom",
        "message": "Invalid input",
        "path": [
          "d",
        ],
      },
    ]
  `);
});

test("partial should not clobber defaults", () => {
  const objWithDefaults = z.object({
    a: z.string().default("defaultA"),
    b: z.string().default("defaultB"),
    c: z.string().default("defaultC"),
  });

  const objPartialWithOneRequired = objWithDefaults.partial(); //.required({ a: true });

  const test = objPartialWithOneRequired.parse({});
  expect(test).toMatchInlineSnapshot(`
    {
      "a": "defaultA",
      "b": "defaultB",
      "c": "defaultC",
    }
  `);
});

test("defaulted object schema returns shallow clone", () => {
  const schema = z
    .object({
      a: z.string(),
    })
    .default({ a: "x" });
  const result1 = schema.parse(undefined);
  const result2 = schema.parse(undefined);
  expect(result1).not.toBe(result2);
  expect(result1).toEqual(result2);
});

test("defaulted array schema returns shallow clone", () => {
  const schema = z.array(z.string()).default(["x"]);
  const result1 = schema.parse(undefined);
  const result2 = schema.parse(undefined);
  expect(result1).not.toBe(result2);
  expect(result1).toEqual(result2);
});

test("defaulted Map schema returns shallow clone", () => {
  const schema = z.map(z.string(), z.number()).default(new Map([["a", 1]]));
  const result1 = schema.parse(undefined);
  const result2 = schema.parse(undefined);
  expect(result1).not.toBe(result2);
  expect(result1).toEqual(result2);
});

test("defaulted Set schema returns shallow clone", () => {
  const schema = z.set(z.string()).default(new Set(["x"]));
  const result1 = schema.parse(undefined);
  const result2 = schema.parse(undefined);
  expect(result1).not.toBe(result2);
  expect(result1).toEqual(result2);
});

test("mutations on defaulted Map do not affect subsequent parses", () => {
  const schema = z.map(z.string(), z.number()).default(new Map());
  const result1 = schema.parse(undefined);
  const result2 = schema.parse(undefined);
  result1.set("key1", 1);
  result2.set("key2", 2);
  expect(result1.size).toBe(1);
  expect(result1.get("key1")).toBe(1);
  expect(result1.has("key2")).toBe(false);
  expect(result2.size).toBe(1);
  expect(result2.get("key2")).toBe(2);
  expect(result2.has("key1")).toBe(false);
});

test("mutations on defaulted Set do not affect subsequent parses", () => {
  const schema = z.set(z.string()).default(new Set());
  const result1 = schema.parse(undefined);
  const result2 = schema.parse(undefined);
  result1.add("item1");
  result2.add("item2");
  expect(result1.size).toBe(1);
  expect(result1.has("item1")).toBe(true);
  expect(result1.has("item2")).toBe(false);
  expect(result2.size).toBe(1);
  expect(result2.has("item2")).toBe(true);
  expect(result2.has("item1")).toBe(false);
});

test("direction-aware defaults", () => {
  const schema = z.string().default("hello");

  // Forward direction (regular parse): defaults should be applied
  expect(schema.parse(undefined)).toBe("hello");
  expect(schema.parse("hello")).toBe("hello");

  // Reverse direction (encode): defaults should NOT be applied, undefined should fail validation
  expect(() => z.encode(schema, undefined as any)).toThrow();

  // But valid values should still work in reverse
  expect(z.safeEncode(schema, "world")).toMatchInlineSnapshot(`
    {
      "data": "world",
      "success": true,
    }
  `);
  expect(z.safeEncode(schema, undefined as any)).toMatchInlineSnapshot(`
    {
      "error": [ZodError: [
      {
        "expected": "string",
        "code": "invalid_type",
        "path": [],
        "message": "Invalid input: expected string, received undefined"
      }
    ]],
      "success": false,
    }
  `);
});

test("default factory runs once per parse inside a container", () => {
  let calls = 0;
  const schema = z.object({
    a: z.string().default(() => {
      calls++;
      return "d";
    }),
  });

  expect(schema.parse({})).toEqual({ a: "d" });
  expect(calls).toBe(1);

  // the key is present, so the factory has nothing to produce
  expect(schema.parse({ a: "given" })).toEqual({ a: "given" });
  expect(calls).toBe(1);
});

test("prefault factory runs once per parse inside a container", () => {
  let calls = 0;
  const schema = z.object({
    a: z.string().prefault(() => {
      calls++;
      return "d";
    }),
  });

  expect(schema.parse({})).toEqual({ a: "d" });
  expect(calls).toBe(1);
});

test("default factory does not run at compile time", () => {
  let calls = 0;
  const compiled = z.compile(
    z.object({
      a: z.string().default(() => {
        calls++;
        return "d";
      }),
    })
  );

  expect(calls).toBe(0);
  expect(compiled.parse({})).toEqual({ a: "d" });
  expect(calls).toBe(1);
});

test("defaultSession factory runs once per parse across fields, with independent copies", () => {
  let calls = 0;
  const factory = () => {
    calls++;
    return { n: calls, tags: ["x"] };
  };
  const inner = z.object({ n: z.number(), tags: z.array(z.string()) });
  const schema = z.object({
    a: inner.defaultSession(factory),
    b: inner.defaultSession(factory),
  });

  // one parse => one factory call, shared by both fields
  const r1 = schema.parse({});
  expect(calls).toBe(1);
  expect(r1.a).toEqual({ n: 1, tags: ["x"] });
  expect(r1.b).toEqual({ n: 1, tags: ["x"] });

  // each field gets an independent JSON copy
  expect(r1.a).not.toBe(r1.b);
  expect(r1.a.tags).not.toBe(r1.b.tags);
  r1.a.n = 999;
  r1.a.tags.push("mutated");
  expect(r1.b).toEqual({ n: 1, tags: ["x"] });

  // the next parse re-evaluates the factory
  const r2 = schema.parse({});
  expect(calls).toBe(2);
  expect(r2.a).toEqual({ n: 2, tags: ["x"] });
  expect(r2.b).toEqual({ n: 2, tags: ["x"] });

  // present values skip the factory entirely
  expect(schema.parse({ a: { n: 5, tags: [] } })).toEqual({ a: { n: 5, tags: [] }, b: { n: 3, tags: ["x"] } });
  expect(calls).toBe(3);
});

test("defaultSession shares one evaluation per explicit factory id", () => {
  let calls = 0;
  const schema = z.object({
    a: z.number().defaultSession(() => {
      calls++;
      return 10;
    }, "shared-id"),
    b: z.number().defaultSession(() => {
      calls++;
      return 20;
    }, "shared-id"),
    c: z.number().defaultSession(() => {
      calls++;
      return 30;
    }, "other-id"),
  });

  // first factory registered under an id wins for the whole session
  expect(schema.parse({})).toEqual({ a: 10, b: 10, c: 30 });
  expect(calls).toBe(2);
});

test("defaultSession runs the default through the inner pipeline", () => {
  let transforms = 0;
  const inner = z.string().transform((v) => {
    transforms++;
    return v.toUpperCase();
  });
  const schema = z.object({
    a: inner.defaultSession(() => "hello"),
    b: inner.defaultSession(() => "hello"),
  });

  expect(schema.parse({})).toEqual({ a: "HELLO", b: "HELLO" });
  expect(transforms).toBe(2);
});

test("defaultSession failing factory rejects before any transform runs", () => {
  let calls = 0;
  let transforms = 0;
  const inner = z.string().transform((v) => {
    transforms++;
    return v.toUpperCase();
  });
  const factory = () => {
    calls++;
    throw new Error("boom");
  };
  const schema = z.object({
    a: inner.defaultSession(factory),
    b: inner.defaultSession(factory),
  });

  const result = schema.safeParse({});
  expect(result.success).toBe(false);
  // the factory ran once for the session, and zero transforms executed
  expect(calls).toBe(1);
  expect(transforms).toBe(0);
  if (!result.success) {
    expect(result.error.issues).toHaveLength(2);
    expect(result.error.issues[0]!.message).toBe("Session default factory failed: boom");
  }
  expect(() => schema.parse({})).toThrow();
});

test("defaultSession circular default value rejects before any transform runs", () => {
  let transforms = 0;
  const inner = z
    .object({ n: z.number() })
    .transform((v) => {
      transforms++;
      return v;
    });
  const factory = () => {
    const o: any = { n: 1 };
    o.self = o; // circular: not a JSON value
    return o;
  };
  const schema = z.object({
    a: inner.defaultSession(factory),
    b: inner.defaultSession(factory),
  });

  const result = schema.safeParse({});
  expect(result.success).toBe(false);
  expect(transforms).toBe(0);
  if (!result.success) {
    expect(result.error.issues[0]!.message).toMatch(/^Session default factory failed: /);
  }
});

test("defaultSession re-entrant factory rejects as circular", () => {
  const ctx: any = {};
  let innerPayload: any;
  const schema = z.number().defaultSession(() => {
    // re-enter the same schema within the same parse session (same ctx object)
    innerPayload = schema._zod.run({ value: undefined, issues: [] }, ctx);
    return 1;
  });

  const payload = schema._zod.run({ value: undefined, issues: [] }, ctx) as any;
  // the re-entrant read sees the pending evaluation and rejects as circular
  expect(innerPayload.issues).toHaveLength(1);
  expect(innerPayload.issues[0].message).toBe(
    "Circular session default: the factory was re-entered before it produced a value"
  );
  // the outer evaluation is unaffected
  expect(payload.issues).toHaveLength(0);
  expect(payload.value).toBe(1);
});

test("defaultSession direction-aware: skipped on encode", () => {
  let calls = 0;
  const schema = z.string().defaultSession(() => {
    calls++;
    return "d";
  });

  expect(schema.parse(undefined)).toBe("d");
  expect(calls).toBe(1);
  expect(() => z.encode(schema, undefined as any)).toThrow();
  expect(calls).toBe(1);
  expect(z.encode(schema, "world")).toBe("world");
});

test("defaultSession unwrap and types", () => {
  const schema = z.string().defaultSession(() => "d");
  expect(schema).toBeInstanceOf(z.ZodDefaultSession);
  expect(schema.unwrap()).toBeInstanceOf(z.ZodString);

  type inp = z.input<typeof schema>;
  expectTypeOf<inp>().toEqualTypeOf<string | undefined>();
  type out = z.output<typeof schema>;
  expectTypeOf<out>().toEqualTypeOf<string>();
});
