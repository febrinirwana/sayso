import { isIP } from "node:net";

/** Same-host Caddy must overwrite this header; the production unit binds Bun to loopback. */
export function clientIp(
  request: Request,
  peer: string | null,
  behindCaddy: boolean,
): string | null {
  if (!behindCaddy) return peer;
  if (peer !== "127.0.0.1" && peer !== "::1" && peer !== "::ffff:127.0.0.1") return null;
  const forwarded = request.headers.get("X-Sayso-Client-IP");
  return forwarded && isIP(forwarded) ? forwarded : null;
}
