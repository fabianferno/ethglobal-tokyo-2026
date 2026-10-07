import { expect, test } from "vitest";
import { checkHtml } from "./server";

const ok = `<canvas id=c></canvas><script>jev.onData(({bundle})=>{draw(bundle);jev.ready()});function draw(){}</script>`;

test("a jev.* program passes the static check", () => expect(checkHtml(ok)).toBeNull());
test("must call jev.onData", () => expect(checkHtml(ok.replace("jev.onData", "x.onData"))).toMatch(/jev\.onData/));
test("must call jev.ready", () => expect(checkHtml(ok.replace("jev.ready", "x.ready"))).toMatch(/jev\.ready/));
