#!/usr/bin/env bun

/**
 * Serpentine Package Lister
 *
 * Extracts RPM packages with versions from a Serpentine container image
 * via SBOM (or rechunker labels fallback) and outputs sorted JSON.
 *
 * Usage: bun packages.ts <tag> [--image <name>]
 *   tag:     Image tag to inspect (e.g., "stable", "43.20260316")
 *   --image: Image name override (default: serpentine)
 *
 * @author BogdanD
 */

declare const process: any;

import {
  type PackageInfo,
  AUTHOR,
  REGISTRY,
  EPOCH_PATTERN,
  FEDORA_PATTERN,
  inspectImage,
  getImageDigest,
  getSbom,
  parseSbomPackages,
} from "./changelog.ts";

/**
 * Fetches packages for a single image:tag via SBOM, with rechunker labels fallback.
 */
async function getPackages(image: string, tag: string): Promise<PackageInfo> {
  const fullImage = `ghcr.io/${AUTHOR}/${image}`;

  // Try SBOM first
  try {
    console.error(`Fetching SBOM for ${image}:${tag}...`);
    const digest = await getImageDigest(fullImage, tag);
    const sbom = await getSbom(fullImage, digest);
    const packages = parseSbomPackages(sbom);
    console.error(`  Found ${Object.keys(packages).length} packages via SBOM`);
    return packages;
  } catch (error) {
    console.error(`  SBOM failed: ${(error as Error).message}`);
    console.error(`  Falling back to rechunker labels...`);
  }

  // Fallback to rechunker labels
  const ref = `${REGISTRY}${image}:${tag}`;
  const manifest = await inspectImage(ref);
  if (manifest?.Labels?.["dev.hhd.rechunk.info"]) {
    const packages = JSON.parse(manifest.Labels["dev.hhd.rechunk.info"]).packages as PackageInfo;
    console.error(`  Found ${Object.keys(packages).length} packages via rechunker labels`);
    return packages;
  }

  throw new Error(`No package data found for ${image}:${tag}`);
}

/**
 * Cleans version strings by removing epoch prefixes and Fedora suffixes.
 */
function cleanVersion(version: string): string {
  return version.replace(EPOCH_PATTERN, "").replace(FEDORA_PATTERN, "");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.error("Usage: bun packages.ts <tag> [--image <name>]");
    console.error("  tag:     Image tag (e.g., 'stable', '43.20260316')");
    console.error("  --image: Image name (default: serpentine)");
    process.exit(1);
  }

  const tag = args[0];
  let image = "serpentine";

  for (let i = 1; i < args.length; i += 2) {
    if (args[i] === "--image" && i + 1 < args.length) {
      image = args[i + 1];
    }
  }

  const packages = await getPackages(image, tag);

  // Build sorted output with cleaned versions
  const sorted: Record<string, string> = {};
  for (const key of Object.keys(packages).sort()) {
    sorted[key] = cleanVersion(packages[key]);
  }

  console.log(JSON.stringify(sorted, null, 2));
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
