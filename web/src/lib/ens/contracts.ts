/**
 * ENSv2 (beta) on Sepolia — addresses from docs.ens.domains/learn/deployments ("Sepolia (ENSv2 Beta)"),
 * ABIs from ensdomains/contracts-v2@71a3b73. The contracts are "not yet final" upstream; if a call
 * starts reverting after an ENS redeploy, re-check these first.
 */
import {
  type Address,
  concat,
  encodeAbiParameters,
  getCreate2Address,
  type Hex,
  keccak256,
  namehash,
  parseAbi,
  stringToHex,
  toHex,
} from "viem";
import { packetToBytes } from "viem/ens";

export const ENS = {
  ETHRegistrar: "0xabe76f6c8dfced81aa5a2bb8034202a7136b94ca",
  ETHRegistry: "0x657ea849311d3d5823348dded7c2aaafb3ede09e",
  VerifiableFactory: "0x9e726eb570beb6bceb495ab8cda7df517d4e841c",
  UserRegistryImpl: "0xa80338aaa8d23831cea25e858d1774534abb0263",
  PermissionedResolverImpl: "0x14f09fd05d4585759e54844dc9b00147131cf243",
  MockUSDC: "0x16f95d91dba7da3aca778ec053df0ff6c6a8aa8e",
  /** Read through the upgradable proxy; never the implementation. viem's sepolia chain already uses it. */
  UniversalResolver: "0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe",
  /** VerifiableFactory.proxyLogic() — part of every proxy's CREATE2 init code. */
  ProxyLogic: "0xC6dbA04e7c6264e85A459Dd592a6CBC2D2a6Ad8E",
} as const satisfies Record<string, Address>;

export const erc20Abi = parseAbi([
  "function mint(address to, uint256 amount)",
  "function approve(address spender, uint256 value) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
]);

export const ethRegistrarAbi = parseAbi([
  "function isAvailable(string label) view returns (bool)",
  "function getRegisterPrice(string label, uint64 duration, address paymentToken) view returns (uint256 base, uint256 premium)",
  "function makeCommitment(string label, address owner, bytes32 secret, address subregistry, address resolver, uint64 duration, bytes32 referrer) pure returns (bytes32)",
  "function commit(bytes32 commitment)",
  "function commitmentAt(bytes32 commitment) view returns (uint64)",
  "function register(string label, address owner, bytes32 secret, address subregistry, address resolver, uint64 duration, address paymentToken, bytes32 referrer) returns (uint256 tokenId)",
]);

export const factoryAbi = parseAbi(["function deployProxy(address implementation, uint256 salt, bytes data) returns (address)"]);

/** Same ABI for the .eth registry and our UserRegistry proxies. */
export const registryAbi = parseAbi([
  "function initialize((address account, uint256 roleBitmap)[] grants)",
  "function register(string label, address owner, address registry, address resolver, uint256 roleBitmap, uint64 expiry) returns (uint256)",
  "function setSubregistry(uint256 anyId, address registry)",
  "function setResolver(uint256 anyId, address resolver)",
  "function setParent(address parent, string label)",
  "function grantRoles(uint256 anyId, uint256 roleBitmap, address account) returns (bool)",
  "function revokeRoles(uint256 anyId, uint256 roleBitmap, address account) returns (bool)",
  "function grantRootRoles(uint256 roleBitmap, address account) returns (bool)",
  "function revokeRootRoles(uint256 roleBitmap, address account) returns (bool)",
  "function hasRootRoles(uint256 roleBitmap, address account) view returns (bool)",
  "function getSubregistry(string label) view returns (address)",
  "function getResolver(string label) view returns (address)",
  "function findOwner(string label) view returns (address)",
  "function getState(uint256 anyId) view returns ((uint8 status, uint64 expiry, address latestOwner, uint256 tokenId, uint256 resource))",
  "event LabelRegistered(uint256 indexed tokenId, bytes32 indexed labelHash, string label, address owner, uint64 expiry, address indexed sender)",
  "event EACRolesChanged(uint256 indexed resource, address indexed account, uint256 oldRoleBitmap, uint256 newRoleBitmap)",
]);

export const resolverAbi = parseAbi([
  "function initialize((address account, uint256 roleBitmap)[] grants, bytes[] calls)",
  "function setText(bytes name, string key, string value)",
  "function setAddress(bytes name, uint256 coinType, bytes addressBytes)",
  "function multicall(bytes[] calls) returns (bytes[])",
  "function grantSetterRoles(bytes setter, address account) returns (bool)",
  "function revokeRootRoles(uint256 roleBitmap, address account) returns (bool)",
  "function hasRootRoles(uint256 roleBitmap, address account) view returns (bool)",
  "function linkToNode(bytes sourceName, bytes32 targetNode)",
]);

/* ── Roles (EAC). Admin of a role = role << 128. ── */
export const ALL_ROLES = 0x1111111111111111111111111111111111111111111111111111111111111111n;
export const ROLE = {
  REGISTRAR: 1n << 0n,
  RENEW: 1n << 16n,
  SET_SUBREGISTRY: 1n << 20n,
  SET_RESOLVER: 1n << 24n,
  CAN_TRANSFER_ADMIN: (1n << 28n) << 128n,
} as const;
export const admin = (r: bigint) => r << 128n;
/** Granted to a name's owner at mint. Admin roles can ONLY be granted at mint time. */
export const OWNER_ROLES =
  ROLE.SET_SUBREGISTRY | admin(ROLE.SET_SUBREGISTRY) | ROLE.SET_RESOLVER | admin(ROLE.SET_RESOLVER) | ROLE.RENEW | admin(ROLE.RENEW) | ROLE.CAN_TRANSFER_ADMIN;

/** Root roles on a folder's registry. Managers can mint into the folder and share it; members can only mint. */
export const FOLDER_MEMBER_ROLES = ROLE.REGISTRAR | ROLE.RENEW;
export const FOLDER_MANAGER_ROLES = FOLDER_MEMBER_ROLES | admin(ROLE.REGISTRAR) | admin(ROLE.RENEW);

/** PermissionedResolver roles (PermissionedResolverLib). */
export const RROLE = {
  SET_ADDRESS: 1n << 0n,
  SET_TEXT: 1n << 4n,
  LINK: 1n << 28n,
} as const;

/** Sui coin type (SLIP-44 784) — where an app's Sui vault id will live. */
export const SUI_COIN_TYPE = 784n;

/* ── Encoding helpers ── */
/** PermissionedResolver setters take the DNS-encoded name, not a namehash. */
export const dnsName = (name: string): Hex => toHex(packetToBytes(name));
export const labelId = (label: string) => BigInt(keccak256(toHex(label)));

/* ── Deterministic proxy addresses (VerifiableFactory CREATE2) ── */
export function predictProxy(deployer: Address, salt: bigint): Address {
  const outerSalt = keccak256(encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [deployer, salt]));
  const init = concat(["0x3d604d80600a3d3981f3363d3d373d3d3d363d73", ENS.ProxyLogic, "0x5af43d82803e903d91602b57fd5bf3", outerSalt]);
  return getCreate2Address({ from: ENS.VerifiableFactory, salt: outerSalt, bytecodeHash: keccak256(init) });
}
export const resolverSalt = (owner: Address, v = 0n) =>
  BigInt(keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "address" }, { type: "uint256" }], [keccak256(stringToHex("OwnedResolver")), owner, v])));
export const registrySalt = (name: string, v = 0n) =>
  BigInt(keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "bytes32" }, { type: "uint256" }], [keccak256(stringToHex("UserRegistry")), namehash(name), v])));
/** A name's own resolver. `v` is random so a retried mint never collides with a half-finished one. */
export const nameResolverSalt = (name: string, v: bigint) =>
  BigInt(keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "bytes32" }, { type: "uint256" }], [keccak256(stringToHex("NameResolver")), namehash(name), v])));

/** Where everything for a given server wallet lives. Pure function of the wallet + name. */
export function layout(server: Address, root: string) {
  return {
    resolver: predictProxy(server, resolverSalt(server)),
    rootRegistry: predictProxy(server, registrySalt(root)),
    folderRegistry: (folder: string) => predictProxy(server, registrySalt(folder)),
  };
}

/** Text-record keys an app/folder carries. ENSIP-27 `class`; the manifest is our own key. */
export const TEXT = {
  manifest: "suica.manifest",
  published: "suica.published",
  kind: "class",
  description: "description",
  url: "url",
  /** JSON array of member Sui addresses who joined this app (e.g. a Group Tab). */
  members: "suica.members",
  /** The name this record was minted for. A name whose record says otherwise is an alias. */
  canonical: "suica.ens",
} as const;
