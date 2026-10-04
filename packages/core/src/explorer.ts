/** MonadVision on Monad testnet 10143; every on-screen number links its source here. */
const EXPLORER = "https://testnet.monadvision.com";

const TX_HASH = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export function explorerTxUrl(hash: string): string {
  if (!TX_HASH.test(hash)) throw new Error(`not a transaction hash: ${hash}`);
  return `${EXPLORER}/tx/${hash}`;
}

export function explorerAddressUrl(address: string): string {
  if (!ADDRESS.test(address)) throw new Error(`not an address: ${address}`);
  return `${EXPLORER}/address/${address}`;
}
