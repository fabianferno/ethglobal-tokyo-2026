import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // server-only throws outside a React Server bundle; tests import server modules' pure helpers.
      "server-only": path.resolve(__dirname, "test/empty.ts"),
    },
  },
  test: { include: ["src/**/*.test.ts"], environment: "node" },
});
