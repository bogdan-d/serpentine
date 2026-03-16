#!/usr/bin/env bun

/**
 * Serpentine Changelog Generator
 *
 * Generates comprehensive changelogs for Serpentine container images by comparing
 * package versions between releases and extracting git commit history.
 *
 * @author Bazzite Team / BogdanD
 * @version 2.0.0 (TypeScript refactor)
 */

// ============================================================================
// TYPE DEFINITIONS AND INTERFACES
// ============================================================================

declare const process: any;
declare const Bun: any;

/**
 * Container manifest information from skopeo inspection
 */
interface Manifest {
  /** Image name / repository */
  Name?: string;
  /** Image digest */
  Digest?: string;
  /** Repository tags associated with the manifest */
  RepoTags: string[];
  /** Creation timestamp */
  Created?: string;
  /** Docker / build tool version */
  DockerVersion?: string;
  /** Container labels including package information */
  Labels?: Record<string, string>;
  /** CPU architecture */
  Architecture?: string;
  /** Operating system */
  Os?: string;
  /** Layers (digest list) */
  Layers?: string[];
  /** Rich layer objects with metadata (size, mime, annotations) */
  LayersData?: Array<{
    MIMEType?: string;
    Digest?: string;
    Size?: number;
    Annotations?: Record<string, any> | null;
  }>;
  /** Environment variables as an array */
  Env?: string[];
}

/**
 * Package information mapping package names to versions
 */
interface PackageInfo {
  [packageName: string]: string;
}

/**
 * Image packages mapping image names to their package info
 */
interface ImagePackages {
  [imageName: string]: PackageInfo;
}

/** SBOM artifact from Syft scan */
interface SbomArtifact {
  name: string;
  version: string;
  type: string;
  [key: string]: any;
}

/** SBOM document structure */
interface SbomDocument {
  artifacts?: SbomArtifact[];
  [key: string]: any;
}

/**
 * Command line options for changelog generation
 */
interface ChangelogOptions {
  /** Target branch/tag (e.g., 'stable', 'main') */
  target: string;
  /** Output file path for environment variables */
  output: string;
  /** Output file path for changelog content */
  changelogFile: string;
  /** Optional pretty title for the changelog */
  pretty?: string;
  /** Git working directory for commit history */
  workdir?: string;
  /** Optional handwritten changelog content */
  handwritten?: string;
}

/**
 * Image tuple containing image name and its components
 */
interface ImageTuple {
  /** Full image name (e.g., 'serpentine-nvidia') */
  img: string;
  /** Base image type (desktop, deck, nvidia-open) */
  base: string;
  /** Desktop environment (kde, gnome) */
  de: string;
}

// ============================================================================
// CONSTANTS AND CONFIGURATION
// ============================================================================

const IMAGE_BASE_NAME = "serpentine";
const AUTHOR = "bogdan-d";

/** Container registry URL */
const REGISTRY = `docker://ghcr.io/${AUTHOR}/`;

const IMAGES = [
  IMAGE_BASE_NAME,
  // `${IMAGE_BASE_NAME}-nvidia`,
];

/** Number of retry attempts for network operations */
const RETRIES = 3;

/** Wait time between retries in seconds */
const RETRY_WAIT = 5;

/** Regex pattern to match Fedora version suffixes */
const FEDORA_PATTERN = /\.fc\d\d/;

/** Regex pattern to match epoch prefixes (e.g., "1:25.2.7-1" -> "25.2.7-1") */
const EPOCH_PATTERN = /^\d+:/;

/** Regex pattern to match stable version tags */
const STABLE_START_PATTERN = /\d\d\.\d/;

/** Factory function to create regex pattern for target-specific tags */
const OTHER_START_PATTERN = (target: string): RegExp => new RegExp(`${target}-\\d\\d\\.\\d`);

// ============================================================================
// MARKDOWN TEMPLATES
// ============================================================================

/** Template for added packages in changelog */
const PATTERN_ADD = "\n| ✨ | {name} | | {version} |";

/** Template for changed packages in changelog */
const PATTERN_CHANGE = "\n| 🔄 | {name} | {prev} | {new} |";

/** Template for removed packages in changelog */
const PATTERN_REMOVE = "\n| ❌ | {name} | {version} | |";

/** Template for package release changes */
const PATTERN_PKGREL_CHANGED = "{prev} ➡️ {new}";

/** Template for package releases */
const PATTERN_PKGREL = "{version}";

/** Template for common changes section */
const COMMON_PAT = "### All Images\n| | Name | Previous | New |\n| --- | --- | --- | --- |{changes}\n\n";

/** Templates for different image categories */
const OTHER_NAMES: Record<string, string> = {
  desktop: "### Desktop Images\n| | Name | Previous | New |\n| --- | --- | --- | --- |{changes}\n\n",
  deck: "### Deck Images\n| | Name | Previous | New |\n| --- | --- | --- | --- |{changes}\n\n",
  kde: "### KDE Images\n| | Name | Previous | New |\n| --- | --- | --- | --- |{changes}\n\n",
  nvidia: "### Nvidia Images\n| | Name | Previous | New |\n| --- | --- | --- | --- |{changes}\n\n",
};

/** Main changelog template */
const NVIDIA_ROW = IMAGES.some((img) => img.includes("nvidia"))
  ? "| **Nvidia** | {pkgrel:nvidia-driver} |\n"
  : "";

/** Template for commits section */
const COMMITS_FORMAT = "### Commits\n| Hash | Subject | Author |\n| --- | --- | --- |{commits}\n\n";

/** Template for individual commit entries */
const COMMIT_FORMAT = `\n| **[{short}](https://github.com/${AUTHOR}/${IMAGE_BASE_NAME}/commit/{hash})** | {subject} | {author} |`;

/** Template for changelog title */
const CHANGELOG_TITLE = "{tag}: {pretty}";

const CHANGELOG_FORMAT = `{handwritten}

From previous \`{target}\` version \`{prev}\` there have been the following changes. **One package per new version shown.**

### Major packages
| Name | Version |
| --- | --- |
| **Kernel** | {pkgrel:kernel} |
| **Firmware** | {pkgrel:atheros-firmware} |
| **Mesa** | {pkgrel:mesa-filesystem} |
| **Gamescope** | {pkgrel:gamescope} |
| **KDE** | {pkgrel:plasma-desktop} |
| **Podman** | {pkgrel:podman} |
| **Docker** | {pkgrel:docker} |
| **ROCm** | {pkgrel:rocm-runtime} |
${NVIDIA_ROW}

{changes}

### How to rebase
For current users, type the following to rebase to this version:
\`\`\`bash
# For this branch (if latest):
serpentine-rollback-helper rebase {target}
# For this specific image:
serpentine-rollback-helper rebase {curr}
\`\`\`
`;

/** Default placeholder for handwritten changelog */
const HANDWRITTEN_PLACEHOLDER = `This is an automatically generated changelog for release \`{curr}\`.`;

/** Packages to exclude from detailed changelog to avoid redundancy */
const BLACKLIST_VERSIONS = [
  "kernel",
  "mesa-filesystem",
  "gamescope",
  "plasma-desktop",
  "atheros-firmware",
  "podman",
  "docker",
  "nvidia-driver",
  "rocm-runtime",
];

const PKG_ALIAS: Record<string, string> = {};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Generator function that yields all possible image combinations
 *
 * @returns Generator yielding image tuples with name and components
 */
function* getImages(): Generator<ImageTuple> {
  for (const img of IMAGES) {
    const base = img.includes('deck') ? 'deck' : 'desktop';
    const de = img.includes('gnome') ? 'gnome' : 'kde';

    yield { img, base, de };
  }
}

/**
 * Fetches container manifests for all Serpentine image variants at a specific target tag
 *
 * Iterates through all image variants (base and NVIDIA) and fetches their manifests
 * from the container registry. Failed fetches are logged and skipped.
 *
 * @param target - The target tag to fetch manifests for (e.g., 'stable', '43.20251107')
 * @returns Promise resolving to a mapping of image names to their manifests
 *
 * @example
 * const manifests = await getManifests('stable');
 * // Returns: { 'serpentine': {...}, 'serpentine-nvidia': {...} }
 */
async function getManifests(target: string): Promise<Record<string, Manifest>> {
  const out: Record<string, Manifest> = {};
  const imgs = Array.from(getImages());

  for (let j = 0; j < imgs.length; j++) {
    const { img } = imgs[j];
    console.log(`Getting ${img}:${target} manifest (${j + 1}/${imgs.length}).`);

    const ref = `${REGISTRY}${img}:${target}`;
    const manifest = await inspectImage(ref);
    if (!manifest) {
      console.log(`Failed to get ${img}:${target}, skipping`);
      continue;
    }

    out[img] = manifest;
  }

  return out;
}

/**
 * Version-aware comparator for image tags.
 * Handles formats like "43.20260316", "43.20260316.1", "testing-43.20260316.2"
 * by splitting on dots and comparing each segment numerically.
 */
function compareVersionTags(a: string, b: string): number {
  const stripPrefix = (t: string) => t.replace(/^[a-z]+-/, "");
  const aParts = stripPrefix(a).split(".").map(Number);
  const bParts = stripPrefix(b).split(".").map(Number);

  for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
    const aVal = aParts[i] ?? -1;
    const bVal = bParts[i] ?? -1;
    if (aVal !== bVal) return aVal - bVal;
  }
  return 0;
}

/**
 * Extracts version tags from manifests, finding current and previous versions
 *
 * Analyzes the RepoTags from manifests to identify the two most recent version tags
 * that match the target pattern. For 'stable', matches tags like '43.20251107'.
 * For other targets, matches tags like 'testing-43.20251107'.
 *
 * Only returns tags that are present across ALL provided manifests to ensure consistency.
 *
 * @param target - The target branch/tag (e.g., 'stable', 'testing')
 * @param manifests - Mapping of image manifests containing RepoTags
 * @returns Tuple containing [previousTag, currentTag] in chronological order
 * @throws Error if fewer than 2 common tags are found
 *
 * @example
 * getTags('stable', manifests)
 * // Returns: ['43.20251106', '43.20251107']
 */
function getTags(target: string, manifests: Record<string, Manifest>): [string, string] {
  const tags = new Set<string>();

  // Select first manifest to get reference tags from
  const first = Object.values(manifests)[0];

  for (const tag of first.RepoTags) {
    // Tags ending with .0 should not exist
    if (tag.endsWith(".0")) {
      continue;
    }

    if (target !== "stable") {
      if (OTHER_START_PATTERN(target).test(tag)) {
        tags.add(tag);
      }
    } else {
      if (STABLE_START_PATTERN.test(tag) && !tag.includes("testing-") && !tag.includes("stable-")) {
        tags.add(tag);
      }
    }
  }

  // Remove tags not present in all images
  for (const manifest of Object.values(manifests)) {
    for (const tag of Array.from(tags)) {
      if (!manifest.RepoTags.includes(tag)) {
        tags.delete(tag);
      }
    }
  }

  const sortedTags = Array.from(tags).sort(compareVersionTags);

  if (sortedTags.length < 2) {
    throw new Error("No current and previous tags found");
  }

  return [sortedTags[sortedTags.length - 2], sortedTags[sortedTags.length - 1]];
}

/**
 * Inspect a container image via skopeo and parse the manifest JSON
 */
async function inspectImage(ref: string): Promise<Manifest | null> {
  let output: string | null = null;
  for (let i = 0; i < RETRIES; i++) {
    try {
      const result = await Bun.$`skopeo inspect ${ref}`.text();
      output = result;
      break;
    } catch (error) {
      if (i < RETRIES - 1) {
        console.log(`Failed to inspect ${ref}, retrying in ${RETRY_WAIT} seconds (${i + 1}/${RETRIES})`);
        await Bun.sleep(RETRY_WAIT * 1000);
      }
    }
  }
  if (!output) return null;
  try {
    return JSON.parse(output) as Manifest;
  } catch (error) {
    console.log(`Failed to parse JSON for ${ref}: ${(error as Error).message}`);
    return null;
  }
}

// ============================================================================
// SBOM-BASED PACKAGE EXTRACTION
// ============================================================================

/**
 * Gets image digest via skopeo inspect
 */
async function getImageDigest(image: string, tag: string): Promise<string> {
  const result = await Bun.$`skopeo inspect docker://${image}:${tag}`.text();
  const manifest = JSON.parse(result);
  return manifest.Digest as string;
}

/**
 * Fetches SBOM using ORAS for the given image and digest
 *
 * Discovers SBOM referrers attached to the image, pulls the SBOM artifact,
 * and handles both .zst (decompresses with zstd) and .json formats.
 */
async function getSbom(image: string, digest: string): Promise<SbomDocument> {
  const fullRef = `${image}@${digest}`;

  // Find the SBOM referrer attached to this image
  const discovered = JSON.parse(
    await Bun.$`oras discover --format json ${fullRef}`.text()
  );

  let sbomDigest: string | null = null;
  for (const referrer of discovered.referrers || []) {
    if ((referrer.artifactType || "").includes("spdx+json")) {
      sbomDigest = referrer.digest;
      break;
    }
  }

  if (!sbomDigest) {
    throw new Error(`No SBOM referrer found for ${fullRef}`);
  }

  const sbomRef = `${image}@${sbomDigest}`;
  const tmpdir = (await Bun.$`mktemp -d`.text()).trim();

  try {
    await Bun.$`oras pull ${sbomRef}`.cwd(tmpdir).quiet();

    // Look for pulled SBOM files
    const files = (await Bun.$`ls ${tmpdir}`.text()).trim().split("\n");
    for (const fname of files) {
      const fpath = `${tmpdir}/${fname}`;
      if (fname.endsWith(".zst")) {
        const content = await Bun.$`zstd -d ${fpath} --stdout`.text();
        return JSON.parse(content) as SbomDocument;
      } else if (fname.endsWith(".json")) {
        const content = await Bun.file(fpath).text();
        return JSON.parse(content) as SbomDocument;
      }
    }

    throw new Error(`No SBOM file found after pulling ${sbomRef}`);
  } finally {
    await Bun.$`rm -rf ${tmpdir}`.quiet();
  }
}

/**
 * Parse RPM packages from an SBOM document
 *
 * Filters artifacts where type === "rpm" and keeps the more specific version
 * (the one with epoch) if a duplicate is encountered.
 */
function parseSbomPackages(sbom: SbomDocument): PackageInfo {
  const packages: PackageInfo = {};

  for (const artifact of sbom.artifacts || []) {
    if (artifact.type !== "rpm") continue;

    const name = artifact.name;
    const version = artifact.version;
    if (!name || !version) continue;

    // If we see the same package, keep the one with epoch (more specific)
    if (!(name in packages) || (version.includes(":") && !packages[name].includes(":"))) {
      packages[name] = version;
    }
  }

  return packages;
}

/**
 * Gets packages for all Serpentine images via SBOM, with fallback to rechunker labels
 */
async function getPackagesFromSbom(target: string): Promise<ImagePackages> {
  const packages: ImagePackages = {};
  const imgs = Array.from(getImages());

  for (let j = 0; j < imgs.length; j++) {
    const { img } = imgs[j];
    console.log(`Getting packages for ${img}:${target} via SBOM (${j + 1}/${imgs.length})`);
    try {
      const fullImage = `ghcr.io/${AUTHOR}/${img}`;
      const digest = await getImageDigest(fullImage, target);
      const sbom = await getSbom(fullImage, digest);
      packages[img] = parseSbomPackages(sbom);
      console.log(`  Found ${Object.keys(packages[img]).length} packages`);
    } catch (error) {
      console.log(`  SBOM failed for ${img}:${target}: ${(error as Error).message}`);
      console.log(`  Falling back to rechunker labels...`);
      // Fallback to rechunker labels
      try {
        const ref = `${REGISTRY}${img}:${target}`;
        const manifest = await inspectImage(ref);
        if (manifest?.Labels?.["dev.hhd.rechunk.info"]) {
          packages[img] = JSON.parse(manifest.Labels["dev.hhd.rechunk.info"]).packages as PackageInfo;
          console.log(`  Fallback: found ${Object.keys(packages[img]).length} packages from labels`);
        }
      } catch (fallbackError) {
        console.log(`  Fallback also failed: ${(fallbackError as Error).message}`);
      }
    }
  }

  return packages;
}

/**
 * Groups packages into common and category-specific sets
 *
 * @param prevTag - Previous version tag
 * @param currTag - Current version tag
 * @returns Tuple containing [commonPackages, categoryPackages, currImagePackages, prevImagePackages]
 */
async function getPackageGroups(
  prevTag: string,
  currTag: string
): Promise<[string[], Record<string, string[]>, ImagePackages, ImagePackages]> {
  const common = new Set<string>();
  const others: Record<string, Set<string>> = {};

  for (const key of Object.keys(OTHER_NAMES)) {
    others[key] = new Set<string>();
  }

  console.log(`\nFetching current packages for ${currTag}...`);
  const npkg = await getPackagesFromSbom(currTag);
  console.log(`\nFetching previous packages for ${prevTag}...`);
  const ppkg = await getPackagesFromSbom(prevTag);

  const keys = new Set([...Object.keys(npkg), ...Object.keys(ppkg)]);
  const pkg: Record<string, Set<string>> = {};

  for (const k of keys) {
    pkg[k] = new Set([
      ...Object.keys(npkg[k] || {}),
      ...Object.keys(ppkg[k] || {})
    ]);
  }

  // Find common packages
  let first = true;
  for (const { img } of getImages()) {
    if (!pkg[img]) {
      continue;
    }

    if (first) {
      for (const p of pkg[img]) {
        common.add(p);
      }
    } else {
      for (const c of Array.from(common)) {
        if (!pkg[img].has(c)) {
          common.delete(c);
        }
      }
    }

    first = false;
  }

  // Find other packages
  for (const [t, other] of Object.entries(others)) {
    first = true;
    for (const { img, base, de } of getImages()) {
      if (!pkg[img]) {
        continue;
      }

      if (t === "nvidia" && !base.includes("nvidia")) {
        continue;
      }
      if (t === "kde" && de !== "kde") {
        continue;
      }
      if (t === "gnome" && de !== "gnome") {
        continue;
      }
      if (t === "deck" && base !== "deck") {
        continue;
      }
      if (t === "desktop" && base === "deck") {
        continue;
      }

      if (first) {
        for (const p of pkg[img]) {
          if (!common.has(p)) {
            other.add(p);
          }
        }
      } else {
        for (const c of Array.from(other)) {
          if (!pkg[img].has(c)) {
            other.delete(c);
          }
        }
      }

      first = false;
    }
  }

  return [
    Array.from(common).sort(),
    Object.fromEntries(Object.entries(others).map(([k, v]) => [k, Array.from(v).sort()])),
    npkg,
    ppkg
  ];
}

/**
 * Extracts version information from ImagePackages, cleaning epoch and Fedora suffixes
 *
 * @param packages - Mapping of image names to their package info
 * @returns Mapping of package names to cleaned version strings
 */
function getVersionsFromPackages(packages: ImagePackages): Record<string, string> {
  const versions: Record<string, string> = {};

  for (const imgPkgs of Object.values(packages)) {
    for (const [pkg, v] of Object.entries(imgPkgs)) {
      let cleaned = v.replace(EPOCH_PATTERN, "");
      cleaned = cleaned.replace(FEDORA_PATTERN, "");
      versions[pkg] = cleaned;
    }
  }

  return versions;
}

/**
 * Calculates package changes between two versions and formats as markdown
 *
 * Analyzes package lists to identify additions, updates, and removals. Implements
 * smart deduplication to show only one package per version, avoiding redundant
 * entries. Packages in BLACKLIST_VERSIONS and their version strings are excluded
 * to keep changelog focused on relevant changes.
 *
 * @param pkgs - List of package names to analyze
 * @param prev - Previous version mapping (package name -> version string)
 * @param curr - Current version mapping (package name -> version string)
 * @returns Formatted markdown string with emoji indicators (✨ add, 🔄 change, ❌ remove)
 *
 * @example
 * calculateChanges(['kernel', 'mesa'], { kernel: '6.10' }, { kernel: '6.11', mesa: '24.2' })
 * // Returns markdown with kernel update and mesa addition
 */
function calculateChanges(
  pkgs: string[],
  prev: Record<string, string>,
  curr: Record<string, string>
): string {
  const added: string[] = [];
  const changed: string[] = [];
  const removed: string[] = [];

  const blacklistVer = new Set(
    BLACKLIST_VERSIONS.map(v => curr[v]).filter((v): v is string => v !== undefined)
  );

  for (const pkg of pkgs) {
    // Clearup changelog by removing mentioned packages
    if (BLACKLIST_VERSIONS.includes(pkg)) {
      continue;
    }
    if (curr[pkg] !== undefined && blacklistVer.has(curr[pkg])) {
      continue;
    }
    if (prev[pkg] !== undefined && blacklistVer.has(prev[pkg])) {
      continue;
    }

    if (!(pkg in prev)) {
      added.push(pkg);
    } else if (!(pkg in curr)) {
      removed.push(pkg);
    } else if (prev[pkg] !== curr[pkg]) {
      changed.push(pkg);
    }

    if (curr[pkg] !== undefined) {
      blacklistVer.add(curr[pkg]);
    }
    if (prev[pkg] !== undefined) {
      blacklistVer.add(prev[pkg]);
    }
  }

  let out = "";
  for (const pkg of added) {
    out += PATTERN_ADD.replace("{name}", pkg).replace("{version}", curr[pkg]);
  }
  for (const pkg of changed) {
    out += PATTERN_CHANGE.replace("{name}", pkg).replace("{prev}", prev[pkg]).replace("{new}", curr[pkg]);
  }
  for (const pkg of removed) {
    out += PATTERN_REMOVE.replace("{name}", pkg).replace("{version}", prev[pkg]);
  }

  return out;
}

/**
 * Extracts git commit history between two revisions
 *
 * @param prevManifests - Previous version manifests
 * @param manifests - Current version manifests
 * @param workdir - Git working directory
 * @returns Formatted markdown string with commit information
 */
async function getCommits(
  prevManifests: Record<string, Manifest>,
  manifests: Record<string, Manifest>,
  workdir: string
): Promise<string> {
  try {
    const start = Object.values(prevManifests)[0].Labels!["org.opencontainers.image.revision"];
    const finish = Object.values(manifests)[0].Labels!["org.opencontainers.image.revision"];

    const commits = await Bun.$`git -C ${workdir} log '--pretty=format:%H|%h|%an|%s' '${start}..${finish}'`.text();

    let out = "";
    for (const commit of commits.split("\n")) {
      if (!commit) {
        continue;
      }
      const parts = commit.split("|");
      if (parts.length < 4) {
        continue;
      }
      const [commitHash, short, author, subject] = parts;

      if (subject.toLowerCase().startsWith("merge")) {
        continue;
      }

      out += COMMIT_FORMAT
        .replace("{short}", short)
        .replace("{subject}", subject)
        .replace("{hash}", commitHash)
        .replace("{author}", author);
    }

    if (out) {
      return COMMITS_FORMAT.replace("{commits}", out);
    }
    return "";
  } catch (error) {
    console.log(`Failed to get commits:\n${(error as Error).message}`);
    return "";
  }
}

/**
 * Generates the complete changelog with all sections
 *
 * Orchestrates the generation of a comprehensive changelog by:
 * 1. Identifying package groups (common and category-specific)
 * 2. Extracting version information from manifests
 * 3. Computing git commit history between versions
 * 4. Calculating package changes for each category
 * 5. Formatting everything into markdown
 *
 * @param handwritten - Optional handwritten changelog content to prepend
 * @param target - Target branch/tag (e.g., 'stable', 'main')
 * @param pretty - Optional pretty title for the changelog
 * @param workdir - Git working directory for commit history extraction
 * @param prev - Previous version tag
 * @param curr - Current version tag
 * @param prevManifests - Previous version manifests for Serpentine images
 * @param manifests - Current version manifests for Serpentine images
 * @returns Tuple containing [title, changelogContent]
 *
 * @remarks
 * The function generates a multi-section changelog including:
 * - Major package versions (kernel, firmware, mesa, etc.)
 * - Git commit history
 * - Common package changes (across all images)
 * - Category-specific changes (desktop, deck, KDE, GNOME, NVIDIA)
 */
async function generateChangelog(
  handwritten: string | null,
  target: string,
  pretty: string | null,
  workdir: string,
  prev: string,
  curr: string,
  prevManifests: Record<string, Manifest>,
  manifests: Record<string, Manifest>,
): Promise<[string, string]> {
  const [common, others, currPackages, prevPackages] = await getPackageGroups(prev, curr);
  const versions = getVersionsFromPackages(currPackages);
  const prevVersions = getVersionsFromPackages(prevPackages);

  // Generate pretty title if not provided
  if (!pretty) {
    let finish = "";
    try {
      finish = Object.values(manifests)[0].Labels!["org.opencontainers.image.revision"];
    } catch (error) {
      console.log(`Failed to get finish hash:\n${(error as Error).message}`);
    }

    // Remove .0 from curr
    let currPretty = curr.replace(/\.\d{1,2}$/, "");
    // Remove target- from curr
    currPretty = currPretty.replace(new RegExp(`^[a-z]+-`), "");
    pretty = target.charAt(0).toUpperCase() + target.slice(1) + " (F" + currPretty;
    if (finish && target !== "stable") {
      pretty += ", #" + finish.substring(0, 7);
    }
    pretty += ")";
  }

  const title = CHANGELOG_TITLE.replace("{tag}", curr).replace("{pretty}", pretty);

  let changelog = CHANGELOG_FORMAT;

  changelog = changelog
    .replace("{handwritten}", handwritten || HANDWRITTEN_PLACEHOLDER)
    .replace(/\{target\}/g, target)
    .replace(/\{prev\}/g, prev)
    .replace(/\{curr\}/g, curr);

  // Replace major package version placeholders
  for (const [pkg, v] of Object.entries(versions)) {
    if (!prevVersions[pkg] || prevVersions[pkg] === v) {
      changelog = changelog.replace(
        `{pkgrel:${pkg}}`,
        PATTERN_PKGREL.replace("{version}", v)
      );
    } else {
      changelog = changelog.replace(
        `{pkgrel:${pkg}}`,
        PATTERN_PKGREL_CHANGED.replace("{prev}", prevVersions[pkg]).replace("{new}", v)
      );
    }
  }

  // Build all changelog sections
  let changes = "";

  // Add git commit history
  changes += await getCommits(prevManifests, manifests, workdir);

  // Add common package changes (packages present in all Serpentine images)
  const commonChanges = calculateChanges(common, prevVersions, versions);
  if (commonChanges) {
    changes += COMMON_PAT.replace("{changes}", commonChanges);
  }

  // Add category-specific package changes (desktop, deck, KDE, GNOME, NVIDIA)
  for (const [k, v] of Object.entries(others)) {
    const chg = calculateChanges(v, prevVersions, versions);
    if (chg) {
      changes += OTHER_NAMES[k].replace("{changes}", chg);
    }
  }

  changelog = changelog.replace("{changes}", changes);

  return [title, changelog];
}

/**
 * Parses command line arguments and returns options object
 *
 * @param args - Command line arguments array
 * @returns Parsed options object
 */
function parseArguments(args: string[]): ChangelogOptions {
  // if (args.length < 1) {
  //   console.error("Usage: bun changelog.ts <target> <output> <changelog> [--pretty <pretty>] [--workdir <workdir>] [--handwritten <handwritten>]");
  //   process.exit(1);
  // }

  const target = args[0]?.split('/').pop()! || 'stable'; // Remove refs/tags, refs/heads, refs/remotes
  const output = args[1];
  const changelogFile = args[2];

  let pretty: string | undefined;
  let workdir = ".";
  let handwritten: string | undefined;

  // Parse optional arguments
  for (let i = 3; i < args.length; i += 2) {
    if (args[i] === "--pretty" && i + 1 < args.length) {
      pretty = args[i + 1];
    } else if (args[i] === "--workdir" && i + 1 < args.length) {
      workdir = args[i + 1];
    } else if (args[i] === "--handwritten" && i + 1 < args.length) {
      handwritten = args[i + 1];
    }
  }

  return {
    target,
    output,
    changelogFile,
    pretty,
    workdir,
    handwritten
  };
}

/**
 * Main function that orchestrates the changelog generation process
 *
 * Workflow:
 * 1. Parses command line arguments
 * 2. Fetches current Serpentine image manifests for target
 * 3. Derives previous and current version tags
 * 4. Fetches previous Serpentine image manifests
 * 5. Generates comprehensive changelog with all sections
 * 6. Writes output to console and optionally to files
 *
 * @remarks
 * Manifests are fetched once per unique image:tag combination and reused
 * throughout the generation process to minimize network calls.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options = parseArguments(args);

  const finalTarget = !options.target || options.target === "main" ? "stable" : options.target;

  // Fetch current Serpentine manifests
  console.log(`\n=== Fetching Serpentine ${finalTarget} manifests ===`);
  const manifests = await getManifests(finalTarget);
  const [prev, curr] = getTags(finalTarget, manifests);
  console.log(`Previous tag: ${prev}`);
  console.log(` Current tag: ${curr}`);

  // Fetch previous Serpentine manifests
  console.log(`\n=== Fetching Serpentine ${prev} manifests ===`);
  const prevManifests = await getManifests(prev);

  // Generate changelog
  console.log(`\n=== Generating changelog ===`);
  const [title, changelog] = await generateChangelog(
    options.handwritten || null,
    finalTarget,
    options.pretty || null,
    options.workdir || ".",
    prev,
    curr,
    prevManifests,
    manifests,
  );

  console.log(`\nChangelog:\n# ${title}\n${changelog}`);
  console.log(`\nOutput:\nTITLE="${title}"\nTAG=${curr}`);

  // Write to files if paths provided
  if (options.changelogFile) {
    await Bun.write(options.changelogFile, changelog);
    console.log(`Changelog written to: ${options.changelogFile}`);
  }

  if (options.output) {
    await Bun.write(options.output, `TITLE="${title}"\nTAG=${curr}\n`);
    console.log(`Output variables written to: ${options.output}`);
  }
}

// Execute main function if this file is run directly
if ((import.meta as any).main) {
  main().catch(console.error);
}