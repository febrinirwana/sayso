import type { Address, Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { z } from "zod";

const optionalValue = (schema: z.ZodType) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema.optional());
const key = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
export const DEFAULT_WEB_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5181",
  "http://127.0.0.1:5181",
] as const;
const webOrigins = z
  .string()
  .default(DEFAULT_WEB_ORIGINS.join(","))
  .transform((value) =>
    value.trim() === "" ? [] : value.split(",").map((origin) => origin.trim()),
  )
  .pipe(
    z.array(
      z.url().refine((origin) => {
        try {
          const url = new URL(origin);
          const isHttp = url.protocol === "http:" || url.protocol === "https:";
          return isHttp && url.origin === origin && !origin.includes("*");
        } catch {
          return false;
        }
      }),
    ),
  );
const envSchema = z.object({
  RPC_URL: z.url(),
  CHAIN_ID: z.coerce.number().refine((value) => value === 10143),
  SAYSO_MARKETS: optionalValue(z.string().regex(/^0x[0-9a-fA-F]{40}$/)),
  STUDIO_DATA_DIR: z.string().min(1),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  STUDIO_BEHIND_CADDY: z.enum(["true", "false"]).default("false"),
  STUDIO_HOURLY_EPISODES: z.enum(["true", "false"]).default("true"),
  STUDIO_WEB_ORIGINS: webOrigins,
  OPERATOR_PK: optionalValue(key),
  BOT_PK: optionalValue(key),
  DRIP_PK: optionalValue(key),
  REPORTER_PK: optionalValue(key),
  DRIP_IP_SALT: optionalValue(z.string().min(32)),
  DRIP_MAX_PER_IP_HOUR: z.coerce.number().int().min(1).default(1),
  STUDIO_REVEAL_URL: optionalValue(z.url()),
  SAYSO_START_BLOCK: optionalValue(z.string().regex(/^(0|[1-9]\d*)$/)),
  CRE_MODE: z.enum(["simulation", "don"]).default("simulation"),
  CRE_RESOLVER_DIR: optionalValue(z.string().min(1)),
  CRE_CLI_PATH: z.string().min(1).default("cre"),
});
export type KeyRole = "operator" | "bot" | "drip" | "reporter";

export class StudioConfig {
  readonly rpcUrl: string;
  readonly chainId = 10143;
  readonly saysoMarkets: Address | undefined;
  readonly dataDir: string;
  readonly port: number;
  readonly behindCaddy: boolean;
  readonly hourlyEpisodes: boolean;
  readonly webOrigins: readonly string[];
  readonly revealApiBaseUrl: string | undefined;
  readonly startBlock: bigint | undefined;
  readonly creMode: "simulation" | "don";
  readonly creResolverDir: string | undefined;
  readonly creCliPath: string;
  readonly dripMaxPerIpHour: number;
  #dripSalt: string | undefined;
  readonly keyAddresses: { role: KeyRole; address: Address }[];
  #keys: Partial<Record<KeyRole, Hex>> = {};

  constructor(env: z.infer<typeof envSchema>) {
    this.rpcUrl = env.RPC_URL;
    this.saysoMarkets = env.SAYSO_MARKETS as Address | undefined;
    this.dataDir = env.STUDIO_DATA_DIR;
    this.port = env.PORT;
    this.behindCaddy = env.STUDIO_BEHIND_CADDY === "true";
    this.hourlyEpisodes = env.STUDIO_HOURLY_EPISODES === "true";
    this.webOrigins = env.STUDIO_WEB_ORIGINS;
    this.revealApiBaseUrl = env.STUDIO_REVEAL_URL as string | undefined;
    this.startBlock =
      env.SAYSO_START_BLOCK === undefined ? undefined : BigInt(env.SAYSO_START_BLOCK as string);
    this.creMode = env.CRE_MODE;
    this.creResolverDir = env.CRE_RESOLVER_DIR as string | undefined;
    this.creCliPath = env.CRE_CLI_PATH;
    this.dripMaxPerIpHour = env.DRIP_MAX_PER_IP_HOUR;
    this.#dripSalt = env.DRIP_IP_SALT as string | undefined;
    this.keyAddresses = [];
    for (const [role, value] of [
      ["operator", env.OPERATOR_PK],
      ["bot", env.BOT_PK],
      ["drip", env.DRIP_PK],
      ["reporter", env.REPORTER_PK],
    ] as const) {
      if (value) {
        const privateKey = value as Hex;
        const address = privateKeyToAccount(privateKey).address;
        this.#keys[role] = privateKey;
        this.keyAddresses.push({ role, address });
      }
    }
    const senders = new Set(this.keyAddresses.map(({ address }) => address.toLowerCase()));
    if (senders.size !== this.keyAddresses.length)
      throw new Error("Studio roles must use distinct sender addresses");
  }

  privateKey(role: KeyRole): Hex | undefined {
    return this.#keys[role];
  }

  dripIpSalt(): string | undefined {
    return this.#dripSalt;
  }
}

export function parseConfig(env: Record<string, string | undefined>): StudioConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    // Zod issues may contain secret inputs; only field names can leave the parser.
    throw new Error(
      `Invalid studio environment: ${parsed.error.issues.map((issue) => issue.path.join(".")).join(", ")}`,
    );
  }
  try {
    return new StudioConfig(parsed.data);
  } catch {
    throw new Error("Invalid studio private key");
  }
}
