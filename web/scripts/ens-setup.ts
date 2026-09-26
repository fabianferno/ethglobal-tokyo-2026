/**
 * One-time setup: register <root> (default suica.eth) on ENSv2 Sepolia with its own UserRegistry
 * and PermissionedResolver, owned by the server wallet. Idempotent — safe to re-run.
 *
 *   pnpm ens:setup
 */
import { writeFileSync } from "node:fs";
import { type Address, encodeFunctionData, keccak256, toHex, zeroHash } from "viem";
import { ALL_ROLES, dnsName, ENS, erc20Abi, ethRegistrarAbi, factoryAbi, labelId, layout, registryAbi, registrySalt, resolverAbi, resolverSalt, TEXT } from "../src/lib/ens/contracts";
import { etherscanTx, publicClient, serverWallet } from "../src/lib/ens/wallet";

process.loadEnvFile(".env.local");

const ROOT = process.env.NEXT_PUBLIC_ENS_ROOT || "suica.eth";
const LABEL = ROOT.replace(/\.eth$/, "");
const DURATION = 31_536_000n; // 1 year

const w = serverWallet();
const me = w.account.address;
const L = layout(me, ROOT);
const log = (...a: unknown[]) => console.log("›", ...a);

async function send(what: string, p: Parameters<typeof w.writeContract>[0]) {
  const hash = await w.writeContract(p);
  log(`${what}: ${etherscanTx(hash)}`);
  const r = await publicClient.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error(`${what} reverted`);
  return r;
}
const hasCode = async (a: Address) => ((await publicClient.getCode({ address: a })) ?? "0x") !== "0x";

async function main() {
  log(`server wallet ${me} · ${Number(await publicClient.getBalance({ address: me })) / 1e18} ETH`);
  log(`root ${ROOT} → registry ${L.rootRegistry}, resolver ${L.resolver}`);

  const state = await publicClient.readContract({ address: ENS.ETHRegistry, abi: registryAbi, functionName: "getState", args: [labelId(LABEL)] });
  const alreadyOurs = state.status !== 0 && state.latestOwner.toLowerCase() === me.toLowerCase();

  // 1. Resolver (with the root's own records set during initialize — no extra tx).
  if (!(await hasCode(L.resolver))) {
    const initCalls = [
      encodeFunctionData({ abi: resolverAbi, functionName: "setText", args: [dnsName(ROOT), TEXT.description, "Suica OS — every app is an agent with an ENS name and a Sui wallet."] }),
      encodeFunctionData({ abi: resolverAbi, functionName: "setText", args: [dnsName(ROOT), TEXT.kind, "Application"] }),
      encodeFunctionData({ abi: resolverAbi, functionName: "setAddress", args: [dnsName(ROOT), 60n, me] }),
    ];
    await send("deploy resolver", {
      address: ENS.VerifiableFactory,
      abi: factoryAbi,
      functionName: "deployProxy",
      args: [ENS.PermissionedResolverImpl, resolverSalt(me), encodeFunctionData({ abi: resolverAbi, functionName: "initialize", args: [[{ account: me, roleBitmap: ALL_ROLES }], initCalls] })],
    });
  } else log("resolver already deployed");

  // 2. Root UserRegistry (where every app/folder subname lives).
  if (!(await hasCode(L.rootRegistry))) {
    await send("deploy root registry", {
      address: ENS.VerifiableFactory,
      abi: factoryAbi,
      functionName: "deployProxy",
      args: [ENS.UserRegistryImpl, registrySalt(ROOT), encodeFunctionData({ abi: registryAbi, functionName: "initialize", args: [[{ account: me, roleBitmap: ALL_ROLES }]] })],
    });
  } else log("root registry already deployed");

  // 3. Register the .eth name (commit → wait ≥60s block time → register), paying in MockUSDC.
  if (alreadyOurs) {
    log(`${ROOT} already registered to us (expiry ${new Date(Number(state.expiry) * 1000).toISOString()})`);
  } else {
    if (state.status !== 0) throw new Error(`${ROOT} is taken by ${state.latestOwner}`);
    const [base, premium] = await publicClient.readContract({ address: ENS.ETHRegistrar, abi: ethRegistrarAbi, functionName: "getRegisterPrice", args: [LABEL, DURATION, ENS.MockUSDC] });
    const price = base + premium;
    log(`price: ${Number(price) / 1e6} MockUSDC`);
    const bal = await publicClient.readContract({ address: ENS.MockUSDC, abi: erc20Abi, functionName: "balanceOf", args: [me] });
    if (bal < price) await send("mint MockUSDC", { address: ENS.MockUSDC, abi: erc20Abi, functionName: "mint", args: [me, 100_000_000n] });
    const allowance = await publicClient.readContract({ address: ENS.MockUSDC, abi: erc20Abi, functionName: "allowance", args: [me, ENS.ETHRegistrar] });
    if (allowance < price) await send("approve registrar", { address: ENS.MockUSDC, abi: erc20Abi, functionName: "approve", args: [ENS.ETHRegistrar, price] });

    const secret = keccak256(toHex(`${ROOT}:${Date.now()}:${Math.random()}`));
    const args = [LABEL, me, secret, L.rootRegistry, L.resolver, DURATION, zeroHash] as const;
    const commitment = await publicClient.readContract({ address: ENS.ETHRegistrar, abi: ethRegistrarAbi, functionName: "makeCommitment", args });
    const c = await send("commit", { address: ENS.ETHRegistrar, abi: ethRegistrarAbi, functionName: "commit", args: [commitment] });
    const committedAt = (await publicClient.getBlock({ blockNumber: c.blockNumber })).timestamp;
    log("waiting ≥60s of block time for the commitment to mature…");
    for (;;) {
      await new Promise((r) => setTimeout(r, 6000));
      const now = (await publicClient.getBlock()).timestamp;
      if (now >= committedAt + 72n) break;
    }
    await send("register", { address: ENS.ETHRegistrar, abi: ethRegistrarAbi, functionName: "register", args: [LABEL, me, secret, L.rootRegistry, L.resolver, DURATION, ENS.MockUSDC, zeroHash] });
  }

  // 4. Canonical parent pointer so explorers can find our registry's name.
  await send("setParent", { address: L.rootRegistry, abi: registryAbi, functionName: "setParent", args: [ENS.ETHRegistry, LABEL] }).catch((e) => log("setParent skipped:", e.shortMessage ?? e.message));

  const block = await publicClient.getBlockNumber();
  const out = { network: "sepolia", root: ROOT, server: me, resolver: L.resolver, rootRegistry: L.rootRegistry, fromBlock: Number(block) - 50 };
  writeFileSync("src/lib/ens/deployment.json", JSON.stringify(out, null, 2) + "\n");
  log("wrote src/lib/ens/deployment.json", out);

  const addr = await publicClient.getEnsAddress({ name: ROOT });
  const desc = await publicClient.getEnsText({ name: ROOT, key: TEXT.description });
  log(`resolves: ${ROOT} → ${addr} · "${desc}"`);
}

main().catch((e) => {
  console.error("✗", e.shortMessage ?? e.message ?? e);
  process.exit(1);
});
