/**
 * Import the founder's on-disk social content library into WOBBLE OS.
 *
 * Usage:
 *   npm run library:import                       # uses the default OneDrive paths below
 *   npm run library:import -- "<imagesRoot>" "<reelsRoot>"
 *
 * Re-runnable: already-imported assets are skipped via their metadata.importKey.
 */
import { closeDb } from "@/db";
import { importLocalSocialLibrary } from "@/lib/library/import-local";

(process as unknown as { loadEnvFile?: (path?: string) => void }).loadEnvFile?.(".env");

const DEFAULT_IMAGES =
  "C:/Users/moizk/OneDrive/Documents/Claude/Projects/Marketing campaign/Wobble-Social-Library-UPLOAD";
const DEFAULT_REELS =
  "C:/Users/moizk/OneDrive/Documents/Claude/Projects/Marketing campaign/PHASE-9-VIDEO-REELS/DELIVERY/SOCIAL-MEDIA";

async function main(): Promise<void> {
  const imagesRoot = process.argv[2] || DEFAULT_IMAGES;
  const reelsRoot = process.argv[3] || DEFAULT_REELS;

  console.log("Importing WOBBLE social library…");
  console.log("  images:", imagesRoot);
  console.log("  reels: ", reelsRoot);

  const result = await importLocalSocialLibrary({ imagesRoot, reelsRoot });

  console.log("\nDone.");
  console.log(`  imported: ${result.imported}`);
  console.log(`  skipped:  ${result.skipped} (already in library)`);
  console.log(`  failed:   ${result.failed}`);
  if (result.errors.length) {
    console.log("\nErrors:");
    for (const e of result.errors.slice(0, 30)) console.log("  -", e);
    if (result.errors.length > 30) console.log(`  … and ${result.errors.length - 30} more`);
  }
}

main()
  .then(() => closeDb())
  .then(() => process.exit(0))
  .catch(async (error) => {
    console.error(error);
    await closeDb().catch(() => {});
    process.exit(1);
  });
