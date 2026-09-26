import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
const [C, D, E] = [0, 1, 2].map(() => privateKeyToAccount(generatePrivateKey()));
const sign = async (a: typeof C, action: string, ens: string) => { const message = JSON.stringify({ app: "suica-os", action, ens, ts: Date.now() }); return { message, signature: await a.signMessage({ message }) }; };
const post = async (path: string, body: unknown) => { const r = await fetch(`http://localhost:3000${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); return [r.status, await r.json()] as const; };
const get = (path: string) => fetch(`http://localhost:3000${path}`).then((r) => r.json());
const ok = (c: boolean, what: string, extra = "") => { console.log(c ? "✓" : "✗", what, extra); if (!c) process.exitCode = 1; };
const tag = Date.now().toString(36).slice(-4);
const manifest = { v: 1, title: "QA", icon: "agent", shell: "notepad", fn: "note", vibe: "chill", scene: "none", prompt: "qa", params: {}, readOnly: false, target: "", owner: "qa", description: "route test 2" };

let [s, j] = await post("/api/ens/mint", { kind: "folder", label: `qa-r2-${tag}`, auth: await sign(C, "mint", `qa-r2-${tag}.suica.eth`) });
ok(s === 200, "C mints folder (tx via Alchemy)", j.ens ?? j.error);
const folder = j.ens;

[s, j] = await post("/api/ens/roles", { ens: folder, target: "suica.eth", role: "member", auth: await sign(C, "share", folder) });
ok(s === 500 && /relayer/.test(j.error), "share by ENS name resolves suica.eth (→ server, refused as relayer)", `${s} ${j.error}`);
[s, j] = await post("/api/ens/roles", { ens: folder, target: "nope-does-not-exist-xyz.eth", role: "member", auth: await sign(C, "share", folder) });
ok(s === 400, "share to unresolvable ENS name → 400", `${s} ${j.error}`);

[s, j] = await post("/api/ens/roles", { ens: folder, target: D.address, role: "manager", auth: await sign(C, "share", folder) });
ok(s === 200 && j.roles.some((r: { account: string; role: string }) => r.account === D.address && r.role === "manager"), "C shares D as manager", `${s} ${j.error ?? ""}`);
[s, j] = await post("/api/ens/roles", { ens: folder, target: E.address, role: "member", auth: await sign(D, "share", folder) });
ok(s === 200, "D (manager) can share E as member", `${s} ${j.error ?? ""}`);
[s, j] = await post("/api/ens/roles", { ens: folder, target: D.address, role: "member", auth: await sign(C, "share", folder) });
ok(s === 200 && j.roles.some((r: { account: string; role: string }) => r.account === D.address && r.role === "member"), "C downgrades D manager → member", `${s} ${j.error ?? ""}`);
[s, j] = await post("/api/ens/roles", { ens: folder, target: E.address, role: "member", auth: await sign(D, "share", folder) });
ok(s === 403, "D (now member) can no longer share", `${s}`);

[s, j] = await post("/api/ens/mint", { kind: "app", label: `qa-pub-${tag}`, parent: "suica.eth", manifest, auth: await sign(C, "mint", `qa-pub-${tag}.suica.eth`) });
ok(s === 200, "C mints app at root", j.ens ?? j.error);
const app = j.ens;
[s, j] = await post("/api/ens/publish", { ens: app, published: true });
ok(s === 200, "publish on per-app resolver", `${s} ${j.error ?? ""}`);
const idx = await get("/api/ens/index");
ok(idx.entries.find((e: { ens: string }) => e.ens === app)?.published === true, "index shows it published");
[s, j] = await post("/api/ens/publish", { ens: app, published: false });
ok(s === 200, "unpublish", `${s} ${j.error ?? ""}`);

const sui = "0x" + "cd".repeat(32);
[s, j] = await post("/api/ens/members", { ens: app, address: sui });
ok(s === 200 && j.members.includes(sui), "Group Tab join writes suica.members", `${s} ${j.error ?? ""}`);
j = await get(`/api/ens/members?ens=${app}`);
ok(j.members?.includes(sui), "GET members reads it back");

[s, j] = await post("/api/ens/mint", { kind: "app", label: `qa-pub-${tag}`, parent: folder, manifest, aliasFrom: app, auth: await sign(C, "mint", `qa-pub-${tag}.${folder}`) });
ok(s === 200 && j.aliased === app, "move via route: old name aliased", `${s} ${j.ens ?? j.error} aliased=${j.aliased}`);
[s, j] = await post("/api/ens/publish", { ens: j.ens, published: true });
ok(s === 200, "publish the moved app", `${s} ${j.error ?? ""}`);
console.log("OLD", app, "NEW", `qa-pub-${tag}.${folder}`);
