import { expect, it } from "vitest";
import { clientIp } from "./client-ip.ts";

function request(ip?: string) {
  const headers = new Headers({ "X-Forwarded-For": "203.0.113.99", Forwarded: "for=203.0.113.99" });
  if (ip !== undefined) headers.set("X-Sayso-Client-IP", ip);
  return new Request("http://localhost/v1/drips", { headers });
}

it("ignores every supplied identity header in direct mode", () => {
  expect(clientIp(request("198.51.100.1"), "192.0.2.1", false)).toBe("192.0.2.1");
  expect(clientIp(request("198.51.100.1"), null, false)).toBeNull();
});

it("accepts one actual IP only from the explicitly enabled loopback proxy", () => {
  for (const peer of ["127.0.0.1", "::1", "::ffff:127.0.0.1"]) {
    expect(clientIp(request("198.51.100.1"), peer, true)).toBe("198.51.100.1");
    expect(clientIp(request("2001:db8::1"), peer, true)).toBe("2001:db8::1");
  }
});

it("rejects non-loopback senders and malformed or missing proxy identity", () => {
  for (const peer of ["192.0.2.1", "127.0.0.2", null]) {
    expect(clientIp(request("198.51.100.1"), peer, true)).toBeNull();
  }
  for (const ip of [
    undefined,
    "",
    "unknown",
    "198.51.100.1, 203.0.113.1",
    "198.51.100.1:443",
    "[2001:db8::1]",
  ]) {
    expect(clientIp(request(ip), "127.0.0.1", true)).toBeNull();
  }
});
