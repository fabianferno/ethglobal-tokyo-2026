/**
 * Server-side ENS operations for Suica OS: mint apps/folders under suica.eth, publish, and index.
 * Only import from route handlers / scripts (uses the server wallet).
 */
import { type Address, encodeFunctionData, type Hex, maxUint64, zeroAddress } from "viem";
import { normalize } from "viem/ens";
import { dnsName, ENS, factoryAbi, layout, ALL_ROLES, OWNER_ROLES, registryAbi, registrySalt, resolverAbi, TEXT } from "./contracts";
import deployment from "./deployment.json";
import type { StoredManifest } from "./manifest";
import { publicClient, serverWallet } from "./wallet";

export const ROOT = deployment.root;
const L = layout(deployment.server as Address, ROOT);

export type ChainEntry = {
  ens: string;
  kind: "app" | "folder";
  parent: string;
  published: boolean;
  manifest: StoredManifest | null;
  description: string;
};

const LABEL_RE = /^[a-z0-9-]{1,40}$/;
export function assertLabel(label: string) {
  const l = normalize(label);
  if (!LABEL_RE.test(l)) throw new Error(`invalid label "${label}"`);
  return l;
}

/** Registry holding a parent's children: the root registry for suica.eth, a folder's own registry otherwise. */
function registryFor(parent: string): Address {
  if (parent === ROOT) return L.rootRegistry;
  if (!parent.endsWith(`.${ROOT}`) || parent.split(".").length !== ROOT.split(".").length + 1) throw new Error(`folders are one level deep under ${ROOT}`);
  return L.folderRegistry(parent);
}

export async function isFree(label: string, parent: string) {
  const owner = await publicClient.readContract({ address: registryFor(parent), abi: registryAbi, functionName: "findOwner", args: [label] });
  return owner === zeroAddress;
}

/** First come, first served: grouptab → grouptab-2 → … */
export async function firstFreeLabel(label: string, parent: string) {
  if (await isFree(label, parent)) return label;
  for (let i = 2; i < 50; i++) if (await isFree(`${label}-${i}`, parent)) return `${label}-${i}`;
  throw new Error("no free label");
}

async function sendAll(txs: Parameters<ReturnType<typeof serverWallet>["writeContract"]>[0][]) {
  const w = serverWallet();
  // Independent txs go out back-to-back (nonceManager), then we wait for all of them.
  const hashes: Hex[] = [];
  for (const t of txs) hashes.push(await w.writeContract(t));
  const receipts = await Promise.all(hashes.map((hash) => publicClient.waitForTransactionReceipt({ hash })));
  const bad = receipts.findIndex((r) => r.status !== "success");
  if (bad >= 0) throw new Error(`tx ${hashes[bad]} reverted`);
  return hashes;
}

function recordCalls(ens: string, texts: Record<string, string>) {
  return [
    ...Object.entries(texts).map(([k, v]) => encodeFunctionData({ abi: resolverAbi, functionName: "setText", args: [dnsName(ens), k, v] })),
    encodeFunctionData({ abi: resolverAbi, functionName: "setAddress", args: [dnsName(ens), 60n, deployment.server as Address] }),
  ];
}

export async function mintApp(opts: { label: string; parent: string; manifest: StoredManifest; published: boolean }) {
  const label = await firstFreeLabel(assertLabel(opts.label), opts.parent);
  const ens = `${label}.${opts.parent}`;
  const hashes = await sendAll([
    {
      address: registryFor(opts.parent),
      abi: registryAbi,
      functionName: "register",
      args: [label, serverWallet().account.address, zeroAddress, L.resolver, OWNER_ROLES, maxUint64],
    },
    {
      address: L.resolver,
      abi: resolverAbi,
      functionName: "multicall",
      args: [
        recordCalls(ens, {
          [TEXT.manifest]: JSON.stringify(opts.manifest),
          [TEXT.kind]: "Application",
          [TEXT.description]: opts.manifest.description.slice(0, 200),
          [TEXT.published]: opts.published ? "1" : "0",
        }),
      ],
    },
  ]);
  return { ens, hashes };
}

export async function mintFolder(opts: { label: string; description?: string }) {
  const label = await firstFreeLabel(assertLabel(opts.label), ROOT);
  const ens = `${label}.${ROOT}`;
  const me = serverWallet().account.address;
  const folderRegistry = L.folderRegistry(ens);
  const deployed = ((await publicClient.getCode({ address: folderRegistry })) ?? "0x") !== "0x";
  const hashes = await sendAll([
    ...(deployed
      ? []
      : [
          {
            address: ENS.VerifiableFactory,
            abi: factoryAbi,
            functionName: "deployProxy" as const,
            args: [ENS.UserRegistryImpl, registrySalt(ens), encodeFunctionData({ abi: registryAbi, functionName: "initialize", args: [[{ account: me, roleBitmap: ALL_ROLES }]] })] as const,
          },
        ]),
    { address: L.rootRegistry, abi: registryAbi, functionName: "register", args: [label, me, folderRegistry, L.resolver, OWNER_ROLES, maxUint64] },
    {
      address: L.resolver,
      abi: resolverAbi,
      functionName: "multicall",
      args: [recordCalls(ens, { [TEXT.kind]: "Group", [TEXT.description]: opts.description ?? `Suica OS workspace ${ens}` })],
    },
  ] as Parameters<ReturnType<typeof serverWallet>["writeContract"]>[0][]);
  return { ens, hashes };
}

export async function setPublished(ens: string, published: boolean) {
  const [hash] = await sendAll([{ address: L.resolver, abi: resolverAbi, functionName: "setText", args: [dnsName(ens), TEXT.published, published ? "1" : "0"] }]);
  return hash;
}

/* ── Index: every app/folder under suica.eth, straight from registry events + text records ── */

async function labelsIn(registry: Address): Promise<string[]> {
  const logs = await publicClient.getContractEvents({
    address: registry,
    abi: registryAbi,
    eventName: "LabelRegistered",
    fromBlock: BigInt(deployment.fromBlock),
    toBlock: "latest",
  });
  return [...new Set(logs.map((l) => l.args.label!).filter(Boolean))];
}

async function readEntry(ens: string, parent: string): Promise<ChainEntry> {
  const [cls, manifest, published, description] = await Promise.all(
    [TEXT.kind, TEXT.manifest, TEXT.published, TEXT.description].map((key) => publicClient.getEnsText({ name: ens, key }).catch(() => null)),
  );
  let parsed: StoredManifest | null = null;
  try {
    parsed = manifest ? (JSON.parse(manifest) as StoredManifest) : null;
  } catch {
    parsed = null;
  }
  return { ens, kind: cls === "Group" ? "folder" : "app", parent, published: published === "1", manifest: parsed, description: description ?? "" };
}

let cache: { at: number; entries: ChainEntry[] } | null = null;

export async function listAll(maxAgeMs = 15_000): Promise<ChainEntry[]> {
  if (cache && Date.now() - cache.at < maxAgeMs) return cache.entries;
  const top = await labelsIn(L.rootRegistry);
  const entries = await Promise.all(top.map((l) => readEntry(`${l}.${ROOT}`, ROOT)));
  const folders = entries.filter((e) => e.kind === "folder");
  const nested = await Promise.all(
    folders.map(async (f) => {
      const code = await publicClient.getCode({ address: L.folderRegistry(f.ens) });
      if (!code || code === "0x") return [];
      const labels = await labelsIn(L.folderRegistry(f.ens));
      return Promise.all(labels.map((l) => readEntry(`${l}.${f.ens}`, f.ens)));
    }),
  );
  cache = { at: Date.now(), entries: [...entries, ...nested.flat()] };
  return cache.entries;
}

export function invalidateIndex() {
  cache = null;
}
