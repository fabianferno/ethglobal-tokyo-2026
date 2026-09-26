/**
 * Server-side ENS operations for Suica OS: mint apps/folders under suica.eth, share folders, publish, and index.
 * Only import from route handlers / scripts (uses the server wallet).
 *
 * ENSv2 layout:
 *   suica.eth            root UserRegistry (server holds root roles)
 *   └─ team.suica.eth    folder = its own UserRegistry; sharing = EAC root roles on it
 *      └─ app.team…      app = its own PermissionedResolver; the creator's device key is root admin,
 *                        the server keeps only argument-scoped setter roles (members / published / Sui addr)
 */
import { type Address, encodeFunctionData, type Hex, keccak256, maxUint64, namehash, toHex, zeroAddress } from "viem";
import { normalize } from "viem/ens";
import {
  ALL_ROLES,
  dnsName,
  ENS,
  factoryAbi,
  FOLDER_MANAGER_ROLES,
  FOLDER_MEMBER_ROLES,
  labelId,
  layout,
  nameResolverSalt,
  OWNER_ROLES,
  predictProxy,
  registryAbi,
  registrySalt,
  resolverAbi,
  ROLE,
  RROLE,
  SUI_COIN_TYPE,
  TEXT,
} from "./contracts";
import deployment from "./deployment.json";
import type { StoredManifest } from "./manifest";
import { logsClient, publicClient, serverWallet } from "./wallet";

export const ROOT = deployment.root;
const SERVER = deployment.server as Address;
const L = layout(SERVER, ROOT);

export type ChainEntry = {
  ens: string;
  kind: "app" | "folder";
  parent: string;
  published: boolean;
  manifest: StoredManifest | null;
  description: string;
  /** Set when this name is a record alias of another (e.g. an app's name before it moved into a folder). */
  aliasOf?: string;
};

const LABEL_RE = /^[a-z0-9-]{1,40}$/;
export function assertLabel(label: string) {
  const l = normalize(label);
  if (!LABEL_RE.test(l)) throw new Error(`invalid label "${label}"`);
  return l;
}

const labelOf = (ens: string) => ens.slice(0, ens.indexOf("."));
const parentOf = (ens: string) => ens.slice(ens.indexOf(".") + 1);

/** Registry holding a parent's children: the root registry for suica.eth, a folder's own registry otherwise. */
function registryFor(parent: string): Address {
  if (parent === ROOT) return L.rootRegistry;
  if (!parent.endsWith(`.${ROOT}`) || parent.split(".").length !== ROOT.split(".").length + 1) throw new Error(`folders are one level deep under ${ROOT}`);
  return L.folderRegistry(parent);
}

const hasCode = async (a: Address) => ((await publicClient.getCode({ address: a })) ?? "0x") !== "0x";

/** The resolver a name points at: its own PermissionedResolver, or the shared one for names minted before per-name resolvers. */
export async function resolverOf(ens: string): Promise<Address> {
  const r = await publicClient.readContract({ address: registryFor(parentOf(ens)), abi: registryAbi, functionName: "getResolver", args: [labelOf(ens)] });
  if (r === zeroAddress) throw new Error(`${ens} is not registered`);
  return r;
}

export async function isFree(label: string, parent: string) {
  const owner = await publicClient.readContract({ address: registryFor(parent), abi: registryAbi, functionName: "findOwner", args: [label] });
  return owner === zeroAddress;
}

/** Top-level labels apps and folders can't take. */
const RESERVED = new Set(["users"]);

/** First come, first served: grouptab → grouptab-2 → … */
export async function firstFreeLabel(label: string, parent: string) {
  const free = async (l: string) => !(parent === ROOT && RESERVED.has(l)) && (await isFree(l, parent));
  if (await free(label)) return label;
  for (let i = 2; i < 50; i++) if (await free(`${label}-${i}`)) return `${label}-${i}`;
  throw new Error("no free label");
}

type Tx = Parameters<ReturnType<typeof serverWallet>["writeContract"]>[0];

async function sendAll(txs: Tx[]) {
  const w = serverWallet();
  // Independent txs go out back-to-back (nonceManager), then we wait for all of them.
  const hashes: Hex[] = [];
  for (const t of txs) hashes.push(await w.writeContract(t));
  const receipts = await Promise.all(hashes.map((hash) => publicClient.waitForTransactionReceipt({ hash })));
  const bad = receipts.findIndex((r) => r.status !== "success");
  if (bad >= 0) throw new Error(`tx ${hashes[bad]} reverted`);
  return hashes;
}

function recordCalls(ens: string, texts: Record<string, string>, ethAddress: Address = SERVER) {
  return [
    ...Object.entries({ ...texts, [TEXT.canonical]: ens }).map(([k, v]) => encodeFunctionData({ abi: resolverAbi, functionName: "setText", args: [dnsName(ens), k, v] })),
    encodeFunctionData({ abi: resolverAbi, functionName: "setAddress", args: [dnsName(ens), 60n, ethAddress] }),
  ];
}

/* ── Per-name PermissionedResolver ── */

/** Deploy a fresh PermissionedResolver for `ens` with its records written during initialize (same tx). */
function deployResolverTx(ens: string, creator: Address | undefined, texts: Record<string, string>, ethAddress?: Address) {
  const salt = nameResolverSalt(ens, BigInt(keccak256(toHex(`${ens}:${Date.now()}:${Math.random()}`))));
  const grants = [{ account: SERVER, roleBitmap: ALL_ROLES }, ...(creator && creator !== SERVER ? [{ account: creator, roleBitmap: ALL_ROLES }] : [])];
  const tx: Tx = {
    address: ENS.VerifiableFactory,
    abi: factoryAbi,
    functionName: "deployProxy",
    args: [ENS.PermissionedResolverImpl, salt, encodeFunctionData({ abi: resolverAbi, functionName: "initialize", args: [grants, recordCalls(ens, texts, ethAddress)] })],
  };
  return { resolver: predictProxy(SERVER, salt), tx };
}

const grantSetter = (setter: Hex, account: Address) => encodeFunctionData({ abi: resolverAbi, functionName: "grantSetterRoles", args: [setter, account] });
const textSetter = (ens: string, key: string) => encodeFunctionData({ abi: resolverAbi, functionName: "setText", args: [dnsName(ens), key, ""] });
const addrSetter = (ens: string, coinType: bigint) => encodeFunctionData({ abi: resolverAbi, functionName: "setAddress", args: [dnsName(ens), coinType, "0x"] });

/**
 * Hand the resolver to its creator: the server keeps only the records it relays (members, published flag,
 * Sui vault address) as argument-scoped EAC roles, then drops its root roles. `extra` runs before the drop.
 */
function sealTx(ens: string, resolver: Address, extra: Hex[] = []): Tx {
  return {
    address: resolver,
    abi: resolverAbi,
    functionName: "multicall",
    args: [
      [
        grantSetter(textSetter(ens, TEXT.members), SERVER),
        grantSetter(textSetter(ens, TEXT.published), SERVER),
        grantSetter(addrSetter(ens, SUI_COIN_TYPE), SERVER),
        ...extra,
        encodeFunctionData({ abi: resolverAbi, functionName: "revokeRootRoles", args: [ALL_ROLES, SERVER] }),
      ],
    ],
  };
}

/* ── Mint ── */

/** Only the creator of `from` (root admin on its resolver) may alias it onto a new name. */
async function canAlias(from: string, to: string, creator: Address) {
  if (from === to || !from.endsWith(`.${ROOT}`)) return false;
  try {
    const r = await resolverOf(from);
    return await publicClient.readContract({ address: r, abi: resolverAbi, functionName: "hasRootRoles", args: [RROLE.SET_TEXT, creator] });
  } catch {
    return false;
  }
}

/** `extraTexts`: additional text records written at mint; they can't override the built-in keys. */
export async function mintApp(opts: { label: string; parent: string; manifest: StoredManifest; published: boolean; creator?: Address; aliasFrom?: string; extraTexts?: Record<string, string> }) {
  const label = await firstFreeLabel(assertLabel(opts.label), opts.parent);
  const ens = `${label}.${opts.parent}`;
  const { resolver, tx } = deployResolverTx(ens, opts.creator, {
    ...opts.extraTexts,
    [TEXT.manifest]: JSON.stringify(opts.manifest),
    [TEXT.kind]: "Application",
    [TEXT.description]: opts.manifest.description.slice(0, 200),
    [TEXT.published]: opts.published ? "1" : "0",
  });
  const hashes = await sendAll([tx, { address: registryFor(opts.parent), abi: registryAbi, functionName: "register", args: [label, SERVER, zeroAddress, resolver, OWNER_ROLES, maxUint64] }]);

  // Second phase needs the resolver's code on-chain (gas estimation calls into it).
  const alias = opts.creator && opts.aliasFrom && (await canAlias(opts.aliasFrom, ens, opts.creator)) ? opts.aliasFrom : undefined;
  if (opts.creator) {
    const link = alias ? [encodeFunctionData({ abi: resolverAbi, functionName: "linkToNode", args: [dnsName(alias), namehash(ens)] })] : [];
    hashes.push(
      ...(await sendAll([
        sealTx(ens, resolver, link),
        ...(alias ? [{ address: registryFor(parentOf(alias)), abi: registryAbi, functionName: "setResolver", args: [labelId(labelOf(alias)), resolver] } as Tx] : []),
      ])),
    );
  }
  return { ens, resolver, aliased: alias, hashes };
}

export async function mintFolder(opts: { label: string; description?: string; owner?: Address }) {
  const label = await firstFreeLabel(assertLabel(opts.label), ROOT);
  const ens = `${label}.${ROOT}`;
  const folderRegistry = L.folderRegistry(ens);
  const deployed = await hasCode(folderRegistry);
  const grants = [{ account: SERVER, roleBitmap: ALL_ROLES }, ...(opts.owner ? [{ account: opts.owner, roleBitmap: FOLDER_MANAGER_ROLES }] : [])];
  const { resolver, tx } = deployResolverTx(ens, opts.owner, { [TEXT.kind]: "Group", [TEXT.description]: opts.description ?? `Suica OS workspace ${ens}` });
  const hashes = await sendAll([
    ...(deployed
      ? []
      : [
          {
            address: ENS.VerifiableFactory,
            abi: factoryAbi,
            functionName: "deployProxy",
            args: [ENS.UserRegistryImpl, registrySalt(ens), encodeFunctionData({ abi: registryAbi, functionName: "initialize", args: [grants] })],
          } as Tx,
        ]),
    tx,
    { address: L.rootRegistry, abi: registryAbi, functionName: "register", args: [label, SERVER, folderRegistry, resolver, OWNER_ROLES, maxUint64] },
  ]);
  if (opts.owner) {
    hashes.push(
      ...(await sendAll([
        ...(deployed ? [{ address: folderRegistry, abi: registryAbi, functionName: "grantRootRoles", args: [FOLDER_MANAGER_ROLES, opts.owner] } as Tx] : []),
        sealTx(ens, resolver),
      ])),
    );
  }
  return { ens, resolver, hashes };
}

/** True if `account` created the app `ens` (holds root text-admin on its sealed resolver). */
export const isAppCreator = (ens: string, account: Address) => canAlias(ens, "", account);

/** Point `ens` at its Sui vault: addr(784) = the vault's 32-byte object id. Works on sealed resolvers via the server's scoped role. */
export async function setSuiVault(ens: string, vaultId: string) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(vaultId)) throw new Error("vault id must be a 32-byte 0x hex object id");
  const [hash] = await sendAll([{ address: await resolverOf(ens), abi: resolverAbi, functionName: "setAddress", args: [dnsName(ens), SUI_COIN_TYPE, vaultId as Hex] }]);
  return hash;
}

export async function setPublished(ens: string, published: boolean) {
  const [hash] = await sendAll([{ address: await resolverOf(ens), abi: resolverAbi, functionName: "setText", args: [dnsName(ens), TEXT.published, published ? "1" : "0"] }]);
  return hash;
}

/* ── Usernames: <name>.users.suica.eth → the user's device key ── */

export const USERS = `users.${ROOT}`;
/** A username is owned by the user's key but can't be transferred (no ROLE_CAN_TRANSFER_ADMIN). */
const USERNAME_ROLES = OWNER_ROLES & ~ROLE.CAN_TRANSFER_ADMIN;

let usersReady: Promise<void> | null = null;

/** Create users.suica.eth (its own registry + resolver) the first time anyone claims a name. */
function ensureUsers() {
  usersReady ??= (async () => {
    if (!(await isFree("users", ROOT))) return;
    const registry = L.folderRegistry(USERS);
    const deployed = await hasCode(registry);
    const { resolver, tx } = deployResolverTx(USERS, undefined, { [TEXT.kind]: "Directory", [TEXT.description]: "Suica OS usernames" });
    await sendAll([
      ...(deployed
        ? []
        : [
            {
              address: ENS.VerifiableFactory,
              abi: factoryAbi,
              functionName: "deployProxy",
              args: [ENS.UserRegistryImpl, registrySalt(USERS), encodeFunctionData({ abi: registryAbi, functionName: "initialize", args: [[{ account: SERVER, roleBitmap: ALL_ROLES }]] })],
            } as Tx,
          ]),
      tx,
      { address: L.rootRegistry, abi: registryAbi, functionName: "register", args: ["users", SERVER, registry, resolver, OWNER_ROLES, maxUint64] },
    ]);
  })().catch((e) => {
    usersReady = null;
    throw e;
  });
  return usersReady;
}

let userCache: { at: number; byKey: Map<string, string> } | null = null;

/** device key (lowercase) → username ENS name, from the users registry's LabelRegistered events + current owners. */
export async function usernames(maxAgeMs = 15_000): Promise<Map<string, string>> {
  if (userCache && Date.now() - userCache.at < maxAgeMs) return userCache.byKey;
  const registry = L.folderRegistry(USERS);
  const byKey = new Map<string, string>();
  if (await hasCode(registry)) {
    const labels = await labelsIn(registry);
    const owners = await Promise.all(labels.map((l) => publicClient.readContract({ address: registry, abi: registryAbi, functionName: "findOwner", args: [l] })));
    labels.forEach((l, i) => owners[i] !== zeroAddress && !byKey.has(owners[i].toLowerCase()) && byKey.set(owners[i].toLowerCase(), `${l}.${USERS}`));
  }
  userCache = { at: Date.now(), byKey };
  return byKey;
}

/** Claim a username for `key`. Idempotent: a key that already has one gets it back. First come, first served. */
export async function claimUsername(requested: string, key: Address) {
  const existing = (await usernames(0)).get(key.toLowerCase());
  if (existing) return { ens: existing, hashes: [] as Hex[] };
  await ensureUsers();
  const label = await firstFreeLabel(assertLabel(requested), USERS);
  const ens = `${label}.${USERS}`;
  const { resolver, tx } = deployResolverTx(ens, key, { [TEXT.kind]: "Person", [TEXT.description]: `Suica OS user ${label}` }, key);
  const hashes = await sendAll([tx, { address: registryFor(USERS), abi: registryAbi, functionName: "register", args: [label, key, zeroAddress, resolver, USERNAME_ROLES, maxUint64] }]);
  hashes.push(...(await sendAll([sealTx(ens, resolver)])));
  if (userCache) userCache.at = 0;
  return { ens, hashes };
}

/* ── Folder sharing: ENSv2 Enhanced Access Control roles on the folder's own registry ── */

export type FolderRole = "manager" | "member";
export type RoleEntry = { account: Address; role: FolderRole | "relayer"; username?: string };

const hasFolderRoles = (folder: string, roles: bigint, account: Address) =>
  publicClient.readContract({ address: registryFor(folder), abi: registryAbi, functionName: "hasRootRoles", args: [roles, account] });

/** Minting into a folder needs ROLE_REGISTRAR on its registry. */
export const canMintInto = (folder: string, account: Address) => hasFolderRoles(folder, ROLE.REGISTRAR, account);
/** Sharing needs the admin roles (a manager). */
export const canShare = (folder: string, account: Address) => hasFolderRoles(folder, FOLDER_MANAGER_ROLES, account);

/** Everyone who holds roles on the folder, read back from EACRolesChanged + current hasRootRoles. */
export async function folderRoles(folder: string): Promise<RoleEntry[]> {
  const registry = registryFor(folder);
  if (!(await hasCode(registry))) return [];
  const accounts = (await scan(registry, "EACRolesChanged")) as Address[];
  const names = await usernames().catch(() => new Map<string, string>());
  const rows = await Promise.all(
    accounts.map(async (account): Promise<RoleEntry | null> => {
      if (account.toLowerCase() === SERVER.toLowerCase()) return { account, role: "relayer" };
      const [mgr, mem] = await Promise.all([hasFolderRoles(folder, FOLDER_MANAGER_ROLES, account), hasFolderRoles(folder, ROLE.REGISTRAR, account)]);
      const username = names.get(account.toLowerCase());
      return mgr ? { account, role: "manager", username } : mem ? { account, role: "member", username } : null;
    }),
  );
  return rows.filter((r): r is RoleEntry => r !== null);
}

/** Set `account`'s role on the folder (null = revoke everything). */
export async function setFolderRole(folder: string, account: Address, role: FolderRole | null) {
  if (account.toLowerCase() === SERVER.toLowerCase()) throw new Error("can't change the relayer's roles");
  const target = role === "manager" ? FOLDER_MANAGER_ROLES : role === "member" ? FOLDER_MEMBER_ROLES : 0n;
  const registry = registryFor(folder);
  const toRevoke = FOLDER_MANAGER_ROLES & ~target;
  return sendAll([
    ...(toRevoke ? [{ address: registry, abi: registryAbi, functionName: "revokeRootRoles", args: [toRevoke, account] } as Tx] : []),
    ...(target ? [{ address: registry, abi: registryAbi, functionName: "grantRootRoles", args: [target, account] } as Tx] : []),
  ]);
}

/* ── Members: Sui addresses that joined an app (Group Tab settle-up reads these) ── */

export async function getMembers(ens: string): Promise<string[]> {
  const raw = await publicClient.getEnsText({ name: ens, key: TEXT.members }).catch(() => null);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Append a member's Sui address to the app's `suica.members` record (idempotent). */
export async function addMember(ens: string, address: string): Promise<{ members: string[]; hash?: Hex }> {
  const current = await getMembers(ens);
  if (current.includes(address)) return { members: current };
  const members = [...current, address].slice(0, 50);
  const [hash] = await sendAll([{ address: await resolverOf(ens), abi: resolverAbi, functionName: "setText", args: [dnsName(ens), TEXT.members, JSON.stringify(members)] }]);
  return { members, hash };
}

/* ── Index: every app/folder under suica.eth, straight from registry events + text records ── */

/** Public RPCs rate-limit bursts of eth_getLogs; back off and retry instead of failing the whole index. */
async function withBackoff<T>(fn: () => Promise<T>, tries = 5): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= tries) throw e;
      await new Promise((r) => setTimeout(r, 1500 * i));
    }
  }
}

/**
 * Incremental log scan: remember the last block scanned per (registry, event) and only fetch newer blocks.
 * The first scan covers the whole deployment range (public RPC); later ones are a few blocks, which fit the
 * keyed RPC's free-tier getLogs limit (Alchemy: 10 blocks), so polling barely touches the public node.
 */
const scanned = new Map<string, { to: bigint; values: Set<string> }>();
const SMALL_RANGE = 9n;

async function scan(registry: Address, event: "LabelRegistered" | "EACRolesChanged"): Promise<string[]> {
  const key = `${registry}:${event}`;
  const head = await publicClient.getBlockNumber();
  const prev = scanned.get(key);
  const from = prev ? prev.to + 1n : BigInt(deployment.fromBlock);
  if (prev && from > head) return [...prev.values];
  const client = head - from <= SMALL_RANGE ? publicClient : logsClient;
  const values = new Set(prev?.values);
  if (event === "LabelRegistered") {
    const logs = await withBackoff(() => client.getContractEvents({ address: registry, abi: registryAbi, eventName: "LabelRegistered", fromBlock: from, toBlock: head }));
    for (const l of logs) if (l.args.label) values.add(l.args.label);
  } else {
    const logs = await withBackoff(() => client.getContractEvents({ address: registry, abi: registryAbi, eventName: "EACRolesChanged", args: { resource: 0n }, fromBlock: from, toBlock: head }));
    for (const l of logs) if (l.args.account) values.add(l.args.account);
  }
  scanned.set(key, { to: head, values });
  return [...values];
}

const labelsIn = (registry: Address) => scan(registry, "LabelRegistered");

async function readEntry(ens: string, parent: string): Promise<ChainEntry> {
  const [cls, manifest, published, description, canonical] = await Promise.all(
    [TEXT.kind, TEXT.manifest, TEXT.published, TEXT.description, TEXT.canonical].map((key) => withBackoff(() => publicClient.getEnsText({ name: ens, key }), 3).catch(() => null)),
  );
  let parsed: StoredManifest | null = null;
  try {
    parsed = manifest ? (JSON.parse(manifest) as StoredManifest) : null;
  } catch {
    parsed = null;
  }
  return {
    ens,
    kind: cls === "Group" ? "folder" : "app",
    parent,
    published: published === "1",
    manifest: parsed,
    description: description ?? "",
    ...(canonical && canonical !== ens ? { aliasOf: canonical } : {}),
  };
}

let cache: { at: number; entries: ChainEntry[] } | null = null;

let inflight: Promise<ChainEntry[]> | null = null;

/** Concurrent callers share one build; if a rebuild fails, serve the last good index rather than nothing. */
export async function listAll(maxAgeMs = 15_000): Promise<ChainEntry[]> {
  if (cache && Date.now() - cache.at < maxAgeMs) return cache.entries;
  inflight ??= buildIndex().finally(() => (inflight = null));
  try {
    return await inflight;
  } catch (e) {
    if (cache) return cache.entries;
    throw e;
  }
}

async function buildIndex(): Promise<ChainEntry[]> {
  const top = (await labelsIn(L.rootRegistry)).filter((l) => !RESERVED.has(l));
  const entries = await Promise.all(top.map((l) => readEntry(`${l}.${ROOT}`, ROOT)));
  const folders = entries.filter((e) => e.kind === "folder" && !e.aliasOf);
  const nested: ChainEntry[] = [];
  // One folder at a time: parallel eth_getLogs bursts get rate-limited on public RPCs.
  for (const f of folders) {
    if (!(await hasCode(L.folderRegistry(f.ens)))) continue;
    const labels = await labelsIn(L.folderRegistry(f.ens));
    nested.push(...(await Promise.all(labels.map((l) => readEntry(`${l}.${f.ens}`, f.ens)))));
  }
  cache = { at: Date.now(), entries: [...entries, ...nested] };
  return cache.entries;
}

/** Force the next listAll() to rebuild, but keep the old entries as the fallback. */
export function invalidateIndex() {
  if (cache) cache.at = 0;
}
