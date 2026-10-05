/**
 * Proof of every ENS subname minted under suica.eth on Sepolia (ENSv2).
 *
 * Scans `LabelRegistered` events across the root registry, every folder's own
 * UserRegistry, and the users registry, and prints each mint with its owner,
 * tokenId, block, and a Sepolia Etherscan tx link. Writes docs/ens-proof.md.
 *
 *   pnpm ens:proof
 */
process.loadEnvFile(".env.local");

import { writeFileSync } from "node:fs";
import { type Address, getAddress } from "viem";
import { layout, registryAbi } from "../src/lib/ens/contracts";
import deployment from "../src/lib/ens/deployment.json";
import { logsClient } from "../src/lib/ens/wallet";

const ROOT = deployment.root;
const SERVER = getAddress(deployment.server);
const L = layout(SERVER, ROOT);
const FROM = BigInt(deployment.fromBlock);
const scan = "https://sepolia.etherscan.io";

type Mint = {
  label: string;
  ens: string;
  owner: Address;
  tokenId: bigint;
  block: bigint;
  tx: string;
  registry: Address;
};

const hasCode = async (a: Address) => ((await logsClient.getCode({ address: a })) ?? "0x") !== "0x";

async function mintsIn(registry: Address, parent: string): Promise<Mint[]> {
  const head = await logsClient.getBlockNumber();
  const logs = await logsClient.getContractEvents({
    address: registry,
    abi: registryAbi,
    eventName: "LabelRegistered",
    fromBlock: FROM,
    toBlock: head,
  });
  return logs
    .filter((l) => l.args.label)
    .map((l) => ({
      label: l.args.label as string,
      ens: `${l.args.label}.${parent}`,
      owner: l.args.owner as Address,
      tokenId: l.args.tokenId as bigint,
      block: l.blockNumber,
      tx: l.transactionHash,
      registry,
    }));
}

async function main() {
  console.log(`\nENS subname mint proof — ${ROOT} (Sepolia / ENSv2)`);
  console.log(`Root registry ${L.rootRegistry}  ${scan}/address/${L.rootRegistry}`);
  console.log(`Server minter ${SERVER}  ${scan}/address/${SERVER}\n`);

  const top = await mintsIn(L.rootRegistry, ROOT);
  const all: Mint[] = [...top];

  // Each folder (incl. the reserved `users` registry) is its own UserRegistry.
  const parents = [...new Set(top.map((m) => m.ens))];
  for (const parent of parents) {
    const reg = L.folderRegistry(parent);
    if (!(await hasCode(reg))) continue;
    all.push(...(await mintsIn(reg, parent)));
  }

  all.sort((a, b) => (a.block === b.block ? 0 : a.block < b.block ? -1 : 1));

  const lines: string[] = [];
  const md: string[] = [
    `# ENS subname mint proof — \`${ROOT}\``,
    ``,
    `Network **Sepolia** · ENSv2 · generated ${new Date().toISOString().slice(0, 10)}`,
    ``,
    `- Root name: [\`${ROOT}\`](${scan}/address/${L.rootRegistry})`,
    `- Root UserRegistry: [\`${L.rootRegistry}\`](${scan}/address/${L.rootRegistry})`,
    `- Server minter wallet: [\`${SERVER}\`](${scan}/address/${SERVER})`,
    `- Shared resolver: [\`${deployment.resolver}\`](${scan}/address/${deployment.resolver})`,
    ``,
    `**${all.length} subnames minted on-chain.**`,
    ``,
    `| # | Subname | Owner | tokenId | Block | Mint tx |`,
    `|---|---------|-------|---------|-------|---------|`,
  ];

  all.forEach((m, i) => {
    lines.push(`${String(i + 1).padStart(3)}  ${m.ens.padEnd(38)}  ${scan}/tx/${m.tx}`);
    md.push(
      `| ${i + 1} | \`${m.ens}\` | \`${m.owner}\` | \`${m.tokenId.toString().slice(0, 12)}…\` | ${m.block} | [tx](${scan}/tx/${m.tx}) |`,
    );
  });

  console.log(lines.join("\n"));
  console.log(`\n${all.length} subnames total.\n`);

  writeFileSync("../docs/ens-proof.md", md.join("\n") + "\n");
  console.log("Wrote docs/ens-proof.md");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
