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
    const composeConfig = deploy.indexOf('docker compose "${COMPOSE_ARGS[@]}" --env-file "$ENV_FILE" config');
    expect(existenceCheck).toBeGreaterThan(0);
    expect(canonicalize).toBeGreaterThan(existenceCheck);
    expect(gitPull).toBeGreaterThan(canonicalize);
    expect(composeConfig).toBeGreaterThan(gitPull);
    expect(deploy).toContain('export WOBBLE_ENV_FILE="$ENV_FILE"');
  });

  it("deploys the vps overlay too, not just the prod file", () => {
    // Deploying with only docker-compose.prod.yml drops the Traefik labels the overlay carries, which
    // takes the public host offline while every container still reports healthy. It has happened once.
    expect(deploy).toContain("docker-compose.prod.yml:docker-compose.vps.yml");
    expect(deploy).toMatch(/COMPOSE_ARGS\+=\(-f "\$_f"\)/);
    // Every compose invocation must go through the expanded array, never a single -f.
    expect(deploy).not.toMatch(/docker compose -f "\$COMPOSE_FILE"/);
  });

  it("refuses a compose file that is not there rather than deploying a partial stack", () => {
    expect(deploy).toContain('[ -f "$_f" ] || { echo "XX  compose file not found: $_f" >&2; exit 1; }');
  });
});
