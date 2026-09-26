/**
 * Mint the demo "published" apps on-chain under suica.eth, so the Start menu's published index
 * comes from ENS instead of a hardcoded list. Idempotent: skips names that already exist.
 *
 *   pnpm ens:seed
 */
process.loadEnvFile(".env.local");

import { PUBLISHED } from "../src/lib/compose/registry";
import { toStored } from "../src/lib/ens/manifest";
import { isFree, mintApp, mintFolder, ROOT } from "../src/lib/ens/onchain";
import { etherscanTx } from "../src/lib/ens/wallet";

const log = (...a: unknown[]) => console.log("›", ...a);

async function main() {
  const folders = [...new Set(PUBLISHED.map((m) => m.ens.split(".").slice(1).join(".")).filter((p) => p !== ROOT))];
  for (const f of folders) {
    const label = f.split(".")[0];
    if (!(await isFree(label, ROOT))) {
      log(`folder ${f} exists`);
      continue;
    }
    const r = await mintFolder({ label });
    log(`folder ${r.ens}`, r.hashes.map(etherscanTx).join(" "));
  }
  // Apps in small parallel batches (nonceManager keeps nonces straight).
  const todo = [];
  for (const m of PUBLISHED) {
    const [label, ...rest] = m.ens.split(".");
    const parent = rest.join(".");
    if (!(await isFree(label, parent))) log(`app ${m.ens} exists`);
    else todo.push({ label, parent, m });
  }
  for (let i = 0; i < todo.length; i += 4) {
    await Promise.all(
      todo.slice(i, i + 4).map(async ({ label, parent, m }) => {
        const r = await mintApp({ label, parent, manifest: toStored(m), published: true });
        log(`app ${r.ens}`, r.hashes.map(etherscanTx).join(" "));
      }),
    );
  }
  log("done");
}

main().catch((e) => {
  console.error("✗", e.shortMessage ?? e.message ?? e);
  process.exit(1);
});
