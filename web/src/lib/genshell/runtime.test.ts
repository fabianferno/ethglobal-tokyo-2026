import { expect, test } from "vitest";
import { srcdocFor } from "./runtime";

test("guest bridge is window.jev with action(), not suica/propose", () => {
  const doc = srcdocFor("<div></div>");
  expect(doc).toContain("window.jev=");
  expect(doc).toContain("action(actionId)");
  expect(doc).not.toMatch(/suica|propose/i);
});

test("sandbox stays locked down", async () => {
  const { SANDBOX } = await import("./runtime");
  expect(SANDBOX).toBe("allow-scripts");
  expect(srcdocFor("")).toContain("default-src 'none'");
});
