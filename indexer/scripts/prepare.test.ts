import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const fixtures: string[] = [];
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "sayso-indexer-prepare-"));
  fixtures.push(root);
  for (const directory of ["indexer/scripts", "packages/core/abi", "packages/core/src"]) {
    mkdirSync(join(root, directory), { recursive: true });
  }
  for (const file of [
    "indexer/scripts/prepare.ts",
    "indexer/config.template.yaml",
    "packages/core/abi/sayso.ts",
    "packages/core/src/addresses.ts",
    "tsconfig.base.json",
  ]) {
    copyFileSync(resolve("..", file), join(root, file));
  }
  return join(root, "indexer");
}
function prepare(cwd: string, check = false) {
  return spawnSync("bun", ["scripts/prepare.ts", ...(check ? ["--check"] : [])], {
    cwd,
    encoding: "utf8",
  });
}

afterEach(() => {
  for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("hosted deployment artifacts", () => {
  it("checks the committed configuration and ABIs without regenerating them", () => {
    const result = prepare(process.cwd(), true);
    expect(result.status, result.stderr).toBe(0);
  });

  it("generates standalone artifacts that keep factory discovery and the deployment block", () => {
    const cwd = fixture();
    const result = prepare(cwd);
    expect(result.status, result.stderr).toBe(0);
    const parsed = spawnSync(
      "bun",
      ["-e", 'console.log(JSON.stringify(Bun.YAML.parse(await Bun.file("config.yaml").text())))'],
      { cwd, encoding: "utf8" },
    );
    const config = JSON.parse(parsed.stdout);
    expect(config.chains[0]).toMatchObject({
      id: 10143,
      start_block: 69202243,
      contracts: [
        { name: "SaysoMarkets", address: ["0xc8492B2906d57c184be372899d18EDF195D11CF8"] },
        { name: "OutcomeToken" },
      ],
    });
    for (const contract of config.contracts) {
      const abi = JSON.parse(readFileSync(join(cwd, contract.abi_file_path), "utf8"));
      for (const event of contract.events) {
        expect(
          abi.some(
            (entry: { type: string; name?: string }) =>
              entry.type === "event" && entry.name === event.event,
          ),
        ).toBe(true);
      }
    }
    expect(JSON.parse(readFileSync(join(cwd, "tsconfig.json"), "utf8")).extends).toBeUndefined();
    expect(prepare(cwd, true).status).toBe(0);
  });

  it.each(["config.yaml", "abi/SaysoMarkets.json", "abi/OutcomeToken.json", "tsconfig.json"])(
    "rejects drift in %s without overwriting the file",
    (file) => {
      const cwd = fixture();
      expect(prepare(cwd).status).toBe(0);
      writeFileSync(join(cwd, file), "drift\n");
      const result = prepare(cwd, true);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(file);
      expect(readFileSync(join(cwd, file), "utf8")).toBe("drift\n");
    },
  );
});
