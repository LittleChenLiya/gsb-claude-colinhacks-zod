// Three-stage example: input validation -> transform -> output schema.
// Self-verifying: exits non-zero if any receipt is unexpected.
// Run from packages/zod/node-tests:
//   node --experimental-transform-types three-stage-example.mts
import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-loader.mjs", import.meta.url);
const z = await import("../src/v4/index.ts");

// A two-link chain; every link exercises all three stage kinds:
//   input:  z.string() matching digits only
//   link 0: transform string -> number, output schema z.number().int().min(0)
//   link 1: transform number -> doubled number, output schema z.number().max(100)
const chain = z
  .stagedPipe(z.string().regex(/^\d+$/, "digits only"))
  .through((raw) => Number(raw), z.number().int().min(0))
  .through((n) => n * 2, z.number().max(100));

for (const input of ["21", "abc", "60"]) {
  const receipt = chain.run(input);
  console.log(
    `input=${JSON.stringify(input)} ok=${receipt.ok} stage=${receipt.stage} link=${receipt.link}` +
      ` value=${String(receipt.value)} issues=${receipt.issues.length}` +
      ` receipts=${receipt.receipts.map((r) => `${r.stage}:${r.ok ? "ok" : "fail"}`).join(" -> ")}`
  );

  if (input === "21") {
    // all three stages pass on both links; 21 * 2 = 42
    assert.equal(receipt.ok, true);
    assert.equal(receipt.value, 42);
    assert.equal(receipt.stage, "output");
    assert.equal(receipt.receipts.length, 5); // input + (transform, output) x 2
  } else if (input === "abc") {
    // fails the input-validation stage; no transform ever runs
    assert.equal(receipt.ok, false);
    assert.equal(receipt.stage, "input");
    assert.deepEqual(
      receipt.receipts.map((r) => r.stage),
      ["input"]
    );
  } else {
    // 60 passes link 0, but 60 * 2 = 120 fails link 1's output schema (.max(100))
    assert.equal(receipt.ok, false);
    assert.equal(receipt.stage, "output");
    assert.equal(receipt.link, 1);
    assert.equal(receipt.issues[0]!.code, "too_big");
  }
}

console.log("three-stage example: all receipts as expected");
