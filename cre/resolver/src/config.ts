import { type Address, isAddress, zeroAddress } from "viem";
import { z } from "zod";

export const configSchema = z.object({
  chainSelectorName: z.literal("monad-testnet"),
  saysoMarkets: z
    .string()
    .refine((value) => isAddress(value) && value.toLowerCase() !== zeroAddress)
    .transform((value) => value as Address),
  // QuickJS has no URL global. Allow an HTTP(S) origin and optional base path,
  // not credentials, query/fragment, whitespace or non-HTTP capability schemes.
  revealApiBaseUrl: z
    .string()
    .regex(
      /^https?:\/\/(?:[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?|\[[a-fA-F0-9:]+\])(?::[1-9]\d{0,4})?(?:\/[^\s?#@\\]*)?$/,
    ),
  reportGasLimit: z
    .string()
    .regex(/^[1-9]\d*$/)
    .refine((value) => BigInt(value) <= 0xffff_ffff_ffff_ffffn),
});
export type Config = z.infer<typeof configSchema>;
