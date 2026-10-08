export type FailureCode =
  | "rpc_rate_limited"
  | "rpc_unavailable"
  | "receipt_timeout"
  | "reverted"
  | "insufficient_funds"
  | "unknown";
export function failureCode(error: unknown): FailureCode {
  const seen = new Set<unknown>();
  let fallback: FailureCode = "unknown";
  while (error && typeof error === "object" && !seen.has(error)) {
    seen.add(error);
    const e = error as { name?: string; status?: number; code?: number; cause?: unknown };
    if (e.status === 429 || e.code === 429 || e.code === -32005) return "rpc_rate_limited";
    if (e.name === "WaitForTransactionReceiptTimeoutError") return "receipt_timeout";
    if (e.name === "ContractFunctionRevertedError" || e.name === "ExecutionRevertedError")
      return "reverted";
    if (e.name === "InsufficientFundsError") return "insufficient_funds";
    if (e.name === "HttpRequestError" || e.name === "TimeoutError" || e.name === "RpcRequestError")
      fallback = "rpc_unavailable";
    error = e.cause;
  }
  return fallback;
}
export function operatorFailure(source: "clock" | "maker" | "receipt" | "startup", error: unknown) {
  console.error(
    JSON.stringify({ event: "studio_failure", source, kind: "failure", code: failureCode(error) }),
  );
}
