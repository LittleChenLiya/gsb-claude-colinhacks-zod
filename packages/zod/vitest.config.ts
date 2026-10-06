import { defaultExclude, defineProject, mergeConfig } from "vitest/config";
import rootConfig from "../../vitest.config.js";

export default mergeConfig(
  rootConfig,
  defineProject({
    resolve: {
      conditions: ["@zod/source", "default"],
    },
    test: {
      // node-tests/ holds plain `node --test` fixtures (node:test runner), not vitest tests.
      exclude: [...defaultExclude, "node-tests/**"],
      typecheck: {
        tsconfig: "./tsconfig.test.json",
      },
    },
  })
);
