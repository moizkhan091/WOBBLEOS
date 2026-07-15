import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("production external environment-file contract", () => {
  const compose = readFileSync("docker-compose.prod.yml", "utf8");
  const deploy = readFileSync("scripts/deploy.sh", "utf8");

  it("does not hard-code a repository-local service env file", () => {
    expect(compose).not.toMatch(/^\s*env_file:\s*\.env\.production\s*$/m);
    expect(compose.match(/\$\{WOBBLE_ENV_FILE:-\.env\.production\}/g)).toHaveLength(3);
  });

  it("validates and canonicalizes the selected file before Git or Docker actions", () => {
    const existenceCheck = deploy.indexOf('[ -f "$ENV_FILE_INPUT" ]');
    const canonicalize = deploy.indexOf('ENV_FILE=$(cd "$(dirname "$ENV_FILE_INPUT")"');
    const gitPull = deploy.indexOf("git pull --ff-only");
    const composeConfig = deploy.indexOf('docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" config');
    expect(existenceCheck).toBeGreaterThan(0);
    expect(canonicalize).toBeGreaterThan(existenceCheck);
    expect(gitPull).toBeGreaterThan(canonicalize);
    expect(composeConfig).toBeGreaterThan(gitPull);
    expect(deploy).toContain('export WOBBLE_ENV_FILE="$ENV_FILE"');
  });
});
