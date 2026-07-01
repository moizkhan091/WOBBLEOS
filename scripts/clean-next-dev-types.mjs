import { rm } from "node:fs/promises";
import { join, resolve } from "node:path";

const projectRoot = resolve(process.cwd());
const target = resolve(projectRoot, ".next", "dev");

if (!target.startsWith(join(projectRoot, ".next"))) {
  throw new Error(`Refusing to remove unexpected path: ${target}`);
}

await rm(target, { recursive: true, force: true });

