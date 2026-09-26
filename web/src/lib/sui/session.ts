"use client";
/**
 * Browser-side zkLogin session. The ephemeral key + proof live in sessionStorage (cleared on tab
 * close; the proof expires at maxEpoch anyway). All Enoki/gRPC work is proxied through /api/sui/*;
 * the browser only generates the ephemeral key, signs the sponsored bytes, and assembles the
 * final zkLogin signature. No secrets from .env.local ever reach here.
 */
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { fromBase64 } from "@mysten/sui/utils";
import { decodeJwt, genAddressSeed, getZkLoginSignature, type ZkLoginSignatureInputs } from "@mysten/sui/zklogin";
import type { SuiIntent } from "@/lib/compose/shapes";

export type BalanceChange = { coinType: string; address: string; amount: string };
export type Sponsored = { bytes: string; digest: string; balanceChanges: BalanceChange[] };

type SuiSession = { address: string; jwt: string; zkp: ZkLoginSignatureInputs; maxEpoch: number; salt: string; ephemeralSecret: string };
type Pending = { ephemeralSecret: string; randomness: string; maxEpoch: number };

const SESSION = "suica:sui:session";
const PENDING = "suica:sui:pending";
const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";

export const hasGoogleLogin = () => !!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

function store(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null; // private mode / SSR
  }
}

export function getSuiSession(): SuiSession | null {
  try {
    const raw = store()?.getItem(SESSION);
    if (!raw) return null;
    const s = JSON.parse(raw) as SuiSession;
    return s?.address ? s : null;
  } catch {
    return null;
  }
}
export const getSuiAddress = () => getSuiSession()?.address ?? null;
export function clearSuiSession() {
  store()?.removeItem(SESSION);
  store()?.removeItem(PENDING);
}

/** Step 1: make an ephemeral key, get an Enoki nonce, and bounce to Google (implicit id_token flow). */
export async function startGoogleLogin(): Promise<void> {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error("Google client id not configured (NEXT_PUBLIC_GOOGLE_CLIENT_ID)");
  const ephemeral = Ed25519Keypair.generate();
  const res = await fetch("/api/sui/zklogin/nonce", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ephemeralPublicKey: ephemeral.getPublicKey().toBase64() }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j.error ?? "could not start zkLogin");
  const pending: Pending = { ephemeralSecret: ephemeral.getSecretKey(), randomness: j.randomness, maxEpoch: j.maxEpoch };
  store()?.setItem(PENDING, JSON.stringify(pending));
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "id_token",
    redirect_uri: location.origin,
    // zkLogin derives the address from sub/aud/iss + salt only; `openid` alone is what Sui's guide uses.
    scope: "openid",
    nonce: j.nonce,
    prompt: "select_account",
  });
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full external OAuth URL, not an internal route
  location.href = `${GOOGLE_AUTH}?${params.toString()}`;
}

/** Step 2: on return from Google, exchange the id_token in the URL fragment for a proof + address. */
export async function completeGoogleLoginFromHash(): Promise<SuiSession | null> {
  const hash = location.hash.startsWith("#") ? location.hash.slice(1) : "";
  const jwt = new URLSearchParams(hash).get("id_token");
  if (!jwt) return null;
  // Drop the fragment so a refresh doesn't reprocess it.
  history.replaceState(null, "", location.pathname + location.search);
  const raw = store()?.getItem(PENDING);
  if (!raw) throw new Error("login state was lost — please try again");
  const pending = JSON.parse(raw) as Pending;
  const ephemeral = Ed25519Keypair.fromSecretKey(pending.ephemeralSecret);
  const res = await fetch("/api/sui/zklogin/zkp", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jwt, ephemeralPublicKey: ephemeral.getPublicKey().toBase64(), randomness: pending.randomness, maxEpoch: pending.maxEpoch }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j.error ?? "could not finish zkLogin");
  const session: SuiSession = { address: j.address, jwt, zkp: j.zkp as ZkLoginSignatureInputs, maxEpoch: pending.maxEpoch, salt: j.salt, ephemeralSecret: pending.ephemeralSecret };
  store()?.setItem(SESSION, JSON.stringify(session));
  store()?.removeItem(PENDING);
  return session;
}

/** Ask the server to build + sponsor + simulate the intent. Shown in the Signing dialog before Approve. */
export async function sponsorSui(intent: SuiIntent): Promise<Sponsored> {
  const session = getSuiSession();
  if (!session) throw new Error("not signed in with Google");
  const res = await fetch("/api/sui/sponsor", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sender: session.address, intent }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j.error ?? "could not sponsor transaction");
  return { bytes: j.bytes, digest: j.digest, balanceChanges: j.balanceChanges ?? [] };
}

/** Sign the sponsored bytes with the ephemeral key, wrap in a zkLogin signature, and execute. */
export async function executeSui(sponsored: Sponsored): Promise<{ digest: string }> {
  const session = getSuiSession();
  if (!session) throw new Error("not signed in with Google");
  const ephemeral = Ed25519Keypair.fromSecretKey(session.ephemeralSecret);
  const { signature: userSignature } = await ephemeral.signTransaction(fromBase64(sponsored.bytes));
  const zkLoginSignature = getZkLoginSignature({ inputs: withAddressSeed(session), maxEpoch: session.maxEpoch, userSignature });
  const res = await fetch("/api/sui/execute", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ digest: sponsored.digest, signature: zkLoginSignature }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j.error ?? "could not execute transaction");
  return { digest: j.digest };
}

export type SuiBalance = { coinType: string; symbol: string; decimals: number; raw: string; amount: number };

/** Read a wallet's real Sui balances (for the Portfolio app). Throws if the read is unavailable. */
export async function fetchSuiBalances(address: string): Promise<SuiBalance[]> {
  const res = await fetch(`/api/sui/balances?address=${encodeURIComponent(address)}`);
  const j = await res.json();
  if (!res.ok) throw new Error(j.error ?? "balances unavailable");
  return (j.balances ?? []) as SuiBalance[];
}

/** Enoki usually returns addressSeed inside the proof; compute it from the JWT + salt if it didn't. */
function withAddressSeed(session: SuiSession): ZkLoginSignatureInputs {
  const zkp = session.zkp as ZkLoginSignatureInputs & { addressSeed?: string };
  if (zkp.addressSeed) return zkp;
  const claims = decodeJwt(session.jwt) as { sub?: string; aud?: string | string[] };
  const aud = Array.isArray(claims.aud) ? claims.aud[0] : claims.aud;
  if (!claims.sub || !aud) throw new Error("id_token missing sub/aud");
  const addressSeed = genAddressSeed(BigInt(session.salt), "sub", claims.sub, aud).toString();
  return { ...zkp, addressSeed };
}
