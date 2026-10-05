import type { Address, Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { z } from "zod";

const optionalValue = (schema: z.ZodType) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema.optional());
const key = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const envSchema = z.object({
  RPC_URL: z.url(),
  CHAIN_ID: z.coerce.number().refine((value) => value === 10143),
  SAYSO_MARKETS: optionalValue(z.string().regex(/^0x[0-9a-fA-F]{40}$/)),
  STUDIO_DATA_DIR: z.string().min(1),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  OPERATOR_PK: optionalValue(key),
  BOT_PK: optionalValue(key),
  DRIP_PK: optionalValue(key),
  REPORTER_PK: optionalValue(key),
});
export type KeyRole = "operator" | "bot" | "drip" | "reporter";

export class StudioConfig {
  readonly rpcUrl: string;
  readonly chainId = 10143;
  readonly saysoMarkets: Address | undefined;
  readonly dataDir: string;
  readonly port: number;
  readonly keyAddresses: { role: KeyRole; address: Address }[];
  #keys: Partial<Record<KeyRole, Hex>> = {};

  constructor(env: z.infer<typeof envSchema>) {
    this.rpcUrl = env.RPC_URL;
    this.saysoMarkets = env.SAYSO_MARKETS as Address | undefined;
    this.dataDir = env.STUDIO_DATA_DIR;
    this.port = env.PORT;
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
  }

  privateKey(role: KeyRole): Hex | undefined {
    return this.#keys[role];
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
