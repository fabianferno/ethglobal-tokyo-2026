import "server-only";
/**
 * Server-only Sui clients. Import ONLY from route handlers and scripts — never from client
 * components. The Enoki private key and the Sui server keypair come from .env.local and must
 * never reach the browser.
 *
 * Design note (deviates from docs/HANDOFF.md step 4): all transaction building, simulation and
 * gRPC live here on the server, where the gRPC fullnode is verified to work from Node. The
 * browser never talks to gRPC (avoids gRPC-web CORS against the public fullnode); it only signs
 * the sponsored bytes Enoki returns and assembles the zkLogin signature.
 */
import { EnokiClient } from "@mysten/enoki";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { NETWORK, grpcUrl } from "./config";

/* ── Enoki (zkLogin proofs + sponsored transactions) ─────────── */
let enoki: EnokiClient | null = null;
export function enokiClient(): EnokiClient {
  const apiKey = process.env.ENOKI_PRIVATE_KEY;
  if (!apiKey) throw new Error("ENOKI_PRIVATE_KEY missing in .env.local");
  return (enoki ??= new EnokiClient({ apiKey }));
}
export const hasEnoki = () => !!process.env.ENOKI_PRIVATE_KEY;

/* ── Sui gRPC fullnode (reads, simulation, execution fallback) ── */
let grpc: SuiGrpcClient | null = null;
export function suiClient(): SuiGrpcClient {
  return (grpc ??= new SuiGrpcClient({ network: NETWORK, baseUrl: grpcUrl() }));
}

/* ── Server keypair (tops up new users, publishes packages, runs the executor) ── */
let keypair: Ed25519Keypair | null = null;
export function serverKeypair(): Ed25519Keypair {
  const sk = process.env.SUI_PRIVATE_KEY;
  if (!sk) throw new Error("SUI_PRIVATE_KEY missing in .env.local");
  // Sui CLI exports a bech32 `suiprivkey1…` string; fromSecretKey accepts that (or raw bytes).
  return (keypair ??= Ed25519Keypair.fromSecretKey(sk));
}
export const hasServerKeypair = () => !!process.env.SUI_PRIVATE_KEY;
/** Prefer the configured address (no key parse needed); fall back to deriving it. */
export const serverAddress = (): string =>
  process.env.SUI_ADDRESS || (hasServerKeypair() ? serverKeypair().toSuiAddress() : "");
