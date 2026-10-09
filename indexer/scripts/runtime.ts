import { chmod, writeFile } from "node:fs/promises";

interface Config {
  chains: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export function runtimeConfig(config: Config, env: Record<string, string | undefined>): Config {
  if (env.ENVIO_API_TOKEN?.trim()) return config;
  if (!env.ENVIO_RPC_URL?.trim()) {
    throw new Error("Set ENVIO_RPC_URL for RPC sync, or ENVIO_API_TOKEN for HyperSync");
  }
  return {
    ...config,
    chains: config.chains.map(({ hypersync_config: _, ...chain }) => ({
      ...chain,
      rpc: [
        // Envio expands the variable in memory; never persist the credential-bearing URL.
        {
          url: `\${ENVIO_RPC_URL}`,
          for: "sync",
          initial_block_interval: 100,
          interval_ceiling: 100,
        },
      ],
    })),
  };
}

if (import.meta.main) {
  const config = Bun.YAML.parse(await Bun.file("config.yaml").text()) as Config;
  const selected = runtimeConfig(config, process.env);
  // JSON is valid YAML. Never expose RPC credentials through logs or git.
  await writeFile("config.runtime.yaml", JSON.stringify(selected), { mode: 0o600 });
  await chmod("config.runtime.yaml", 0o600);
}
