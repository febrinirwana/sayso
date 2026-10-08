/** Public build-time settings. Testnet only; nothing here is a secret. */
const env = import.meta.env;

export const config = {
  /** Studio origin: clock, SSE, drip, reveal, on-demand episodes, media. Empty = same origin (Caddy in production, Vite proxy in dev). */
  studioUrl: (env.VITE_STUDIO_URL as string | undefined) || "",
  /** Envio HyperIndex GraphQL endpoint. */
  indexerUrl: (env.VITE_INDEXER_URL as string | undefined) || "http://127.0.0.1:8080/v1/graphql",
  rpcUrl: (env.VITE_RPC_URL as string | undefined) || "https://testnet-rpc.monad.xyz",
  /** Passkey relying-party ID. Production must set the permanent domain; localhost passkeys are throwaway. */
  rpId: (env.VITE_RP_ID as string | undefined) || globalThis.location?.hostname || "localhost",
} as const;
