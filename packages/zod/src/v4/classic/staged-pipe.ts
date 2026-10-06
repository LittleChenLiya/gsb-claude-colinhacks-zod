import type * as core from "../core/index.js";
import type { ZodType } from "./schemas.js";

/**
 * Stage receipts for staged pipes.
 *
 * A staged pipe is a synchronous chain with three distinct stage kinds:
 *
 * 1. `input`     — input validation against the entry schema
 * 2. `transform` — a plain mapping function between two schemas
 * 3. `output`    — output validation of the transform's return value
 *
 * Every executed stage appends a {@link StagedPipeStageReceipt}. A failing
 * stage stops the chain: successor links are never executed, and each
 * transform is invoked exactly once per run. The regular `z.pipe()` is
 * unaffected by this module.
 */

/** The three stage kinds distinguished by a staged-pipe receipt. */
export type StagedPipeStage = "input" | "transform" | "output";

/** Receipt for a single executed stage. */
export interface StagedPipeStageReceipt {
  /** Which stage this receipt describes. */
  stage: StagedPipeStage;
  /** Index of the chain link this stage belongs to; `null` for the input-validation stage. */
  link: number | null;
  /** Whether the stage succeeded. */
  ok: boolean;
  /** Issues raised by a failing schema stage (`input` / `output`). Empty otherwise. */
  issues: core.$ZodIssue[];
  /** Error thrown by a failing `transform` stage. */
  error?: unknown;
}

/** Receipt for one full staged-pipe run. */
export interface StagedPipeReceipt<Output = unknown> {
  /** Whether the whole chain succeeded. */
  ok: boolean;
  /** Stage where the chain stopped: the failing stage, or the last executed stage on success. */
  stage: StagedPipeStage;
  /** Link index where the chain stopped; `null` when it stopped at input validation. */
  link: number | null;
  /** Final output value. Only present when `ok` is `true`. */
  value?: Output;
  /** Issues from the failing schema stage. Empty when a transform failed or on success. */
  issues: core.$ZodIssue[];
  /** Error thrown by a failing transform. */
  error?: unknown;
  /** Per-stage receipts, in execution order. */
  receipts: StagedPipeStageReceipt[];
}

/** One chain link: a transform plus the output schema its return value is validated against. */
export interface StagedPipeLink {
  transform: (value: any) => unknown;
  out: ZodType<any, any>;
}

/**
 * A synchronous staged pipe. Immutable: `.through()` returns a new pipe with
 * one more link. Use `.run()` to execute the chain and collect stage receipts.
 */
export class ZodStagedPipe<Output = unknown> {
  constructor(
    /** Entry schema for the input-validation stage. */
    readonly input: ZodType<any, any>,
    /** Chain links, each a transform plus its output schema. */
    readonly links: ReadonlyArray<StagedPipeLink> = []
  ) {}

  /** Append a link: `transform`'s return value is validated by `out` before the next link runs. */
  through<S extends ZodType<any, any>>(
    transform: (value: Output) => core.input<S>,
    out: S
  ): ZodStagedPipe<core.output<S>> {
    return new ZodStagedPipe(this.input, [...this.links, { transform, out }]);
  }

  /** Run the chain synchronously and return a receipt describing every executed stage. */
  run(value: unknown): StagedPipeReceipt<Output> {
    const receipts: StagedPipeStageReceipt[] = [];

    // Stage: input validation
    const inputResult = this.input.safeParse(value);
    if (!inputResult.success) {
      const issues = inputResult.error.issues;
      receipts.push({ stage: "input", link: null, ok: false, issues });
      return { ok: false, stage: "input", link: null, issues, receipts };
    }
    receipts.push({ stage: "input", link: null, ok: true, issues: [] });

    let current: unknown = inputResult.data;

    for (const [index, link] of this.links.entries()) {
      // Stage: transform — invoked exactly once per run
      let transformed: unknown;
      try {
        transformed = link.transform(current);
      } catch (error) {
        receipts.push({ stage: "transform", link: index, ok: false, issues: [], error });
        return { ok: false, stage: "transform", link: index, issues: [], error, receipts };
      }
      if (transformed instanceof Promise) {
        const error = new Error("z.stagedPipe: async transforms are not supported (sync chains only)");
        receipts.push({ stage: "transform", link: index, ok: false, issues: [], error });
        return { ok: false, stage: "transform", link: index, issues: [], error, receipts };
      }
      receipts.push({ stage: "transform", link: index, ok: true, issues: [] });

      // Stage: output schema — the transform's return value must pass output validation
      const outputResult = link.out.safeParse(transformed);
      if (!outputResult.success) {
        const issues = outputResult.error.issues;
        receipts.push({ stage: "output", link: index, ok: false, issues });
        return { ok: false, stage: "output", link: index, issues, receipts };
      }
      receipts.push({ stage: "output", link: index, ok: true, issues: [] });
      current = outputResult.data;
    }

    const lastLink = this.links.length - 1;
    return {
      ok: true,
      stage: lastLink >= 0 ? "output" : "input",
      link: lastLink >= 0 ? lastLink : null,
      value: current as Output,
      issues: [],
      receipts,
    };
  }
}

/** Create a synchronous staged pipe whose first stage validates against `input`. */
export function stagedPipe<S extends ZodType<any, any>>(input: S): ZodStagedPipe<core.output<S>> {
  return new ZodStagedPipe(input, []);
}
