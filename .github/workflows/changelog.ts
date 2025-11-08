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
  `${IMAGE_BASE_NAME}-nvidia`,
];

/** Upstream (base) image used to build Serpentine */
const UPSTREAM_IMAGE = "ublue-os/bazzite-deck";

/** Container registry URL for upstream */
const UPSTREAM_REGISTRY = "docker://ghcr.io/";

/** URL template for upstream releases */
const UPSTREAM_RELEASE_URL = "https://github.com/ublue-os/bazzite/releases/tag/{upstream_tag}";

/** Number of retry attempts for network operations */
const RETRIES = 3;

/** Wait time between retries in seconds */
const RETRY_WAIT = 5;

/** Regex pattern to match Fedora version suffixes */
const FEDORA_PATTERN = /\.fc\d\d/;

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

/** Template for upstream base image changes section with major packages */
const UPSTREAM_PAT = `## Upstream Base Image [${UPSTREAM_IMAGE}](${UPSTREAM_RELEASE_URL})
**Release Date:** {upstream_created}

### Major packages (from upstream: ${UPSTREAM_IMAGE})
| Name | Version |
| --- | --- |
| **Kernel** | {pkgrel:kernel} |
| **Firmware** | {pkgrel:atheros-firmware} |
| **Mesa** | {pkgrel:mesa-filesystem} |
| **Gamescope** | {pkgrel:gamescope} |
| **KDE** | {pkgrel:plasma-desktop} |
| **[HHD](https://github.com/hhd-dev/hhd)** | {pkgrel:hhd} |

### Package changes (from upstream: ${UPSTREAM_IMAGE})
| | Name | Previous | New |
| --- | --- | --- | --- |{changes}

`;

/** Template for commits section */
const COMMITS_FORMAT = "### Commits\n| Hash | Subject | Author |\n| --- | --- | --- |{commits}\n\n";

/** Template for individual commit entries */
const COMMIT_FORMAT = `\n| **[{short}](https://github.com/${AUTHOR}/${IMAGE_BASE_NAME}/commit/{hash})** | {subject} | {author} |`;

/** Template for changelog title */
const CHANGELOG_TITLE = "{tag}: {pretty}";

/** Main changelog template */
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
| **[HHD](https://github.com/hhd-dev/hhd)** | {pkgrel:hhd} |

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
];

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

  const sortedTags = Array.from(tags).sort();

  if (sortedTags.length < 2) {
    throw new Error("No current and previous tags found");
  }

  return [sortedTags[sortedTags.length - 2], sortedTags[sortedTags.length - 1]];
}

/**
 * Extracts package information from container manifests
 *
 * @param manifests - Mapping of image manifests
 * @returns Mapping of image names to their package information
 */
function getPackages(manifests: Record<string, Manifest>): ImagePackages {
  const packages: ImagePackages = {};

  for (const [img, manifest] of Object.entries(manifests)) {
    try {
      if (manifest.Labels && manifest.Labels["dev.hhd.rechunk.info"]) {
        packages[img] = JSON.parse(manifest.Labels["dev.hhd.rechunk.info"]).packages as PackageInfo;
      }
    } catch (error) {
      console.log(`Failed to get packages for ${img}:\n${(error as Error).message}`);
    }
  }

  return packages;
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

/**
 * Fetches upstream (base) image manifests for a specific target/tag
 *
 * Retrieves the manifest for the upstream base image (bazzite-deck) that Serpentine
 * is built on top of. Returns a single-entry mapping to maintain compatibility with
 * helper functions that expect Record<string, Manifest> format.
 *
 * @param target - The target tag to fetch upstream manifest for (e.g., 'stable')
 * @returns Promise resolving to a mapping with single upstream image manifest,
 *          or empty object if fetch fails
 *
 * @example
 * const upstream = await getUpstreamManifests('stable');
 * // Returns: { 'ublue-os/bazzite-deck': {...} }
 */
async function getUpstreamManifests(target: string): Promise<Record<string, Manifest>> {
  const out: Record<string, Manifest> = {};
  const ref = `${UPSTREAM_REGISTRY}${UPSTREAM_IMAGE}:${target}`;
  console.log(`Getting upstream ${UPSTREAM_IMAGE}:${target} manifest.`);
  const manifest = await inspectImage(ref);
  if (manifest) {
    out[UPSTREAM_IMAGE] = manifest;
  } else {
    console.log(`Failed to get upstream ${UPSTREAM_IMAGE}:${target}, skipping upstream section`);
  }
  return out;
}

/**
 * Builds the upstream changes section for the changelog.
 *
 * Compares the upstream base image packages between its previous and current tag
 * to show what changed in the base layer that Serpentine is built on top of.
 *
 * @param target - The target branch/tag (e.g., 'stable')
 * @param upstreamCurrManifests - Already-fetched current upstream manifests (optional, will fetch if not provided)
 * @param upstreamPrevManifests - Already-fetched previous upstream manifests (optional, will fetch if not provided)
 * @returns Formatted markdown string with upstream package changes, or empty string on failure
 *
 * @remarks
 * This function uses the same tag selection logic as Serpentine images to find
 * the previous and current version tags in the upstream image's RepoTags.
 */
async function getUpstreamSection(
  target: string,
  upstreamCurrManifests?: Record<string, Manifest>,
  upstreamPrevManifests?: Record<string, Manifest>
): Promise<string> {
  try {
    // Fetch current upstream manifests if not provided
    const upstreamCurr = upstreamCurrManifests || await getUpstreamManifests(target);
    if (!Object.keys(upstreamCurr).length) return "";

    // Derive previous and current tags from upstream manifest
    let prevTag = "";
    let currTag = "";
    try {
      [prevTag, currTag] = getTags(target, upstreamCurr);
      console.log(`Upstream previous tag: ${prevTag}`);
      console.log(`Upstream  current tag: ${currTag}`);
    } catch (e) {
      console.log(`Failed to determine upstream tags: ${(e as Error).message}`);
      return "";
    }

    // Fetch previous upstream manifests if not provided
    const upstreamPrev = upstreamPrevManifests || await getUpstreamManifests(prevTag);

    // Extract package versions from both manifests
    const prevVersions = getVersions(upstreamPrev);
    const currVersions = getVersions(upstreamCurr);

    // Combine all package names from both versions
    const pkgs = Array.from(new Set([
      ...Object.keys(prevVersions),
      ...Object.keys(currVersions)
    ])).sort();

    // Calculate and format package changes
    const chg = calculateChanges(pkgs, prevVersions, currVersions);
    if (!chg) return "";

    // Extract upstream creation date
    const first = Object.values(upstreamCurr)[0] as Manifest;
    const upstreamDate = first.Created ? (new Date(first.Created)).toString() : "unknown";

    // Build upstream section with major packages
    let upstreamSection = UPSTREAM_PAT
      .replace("{changes}", chg)
      .replace("{upstream_created}", upstreamDate)
      .replace("{upstream_tag}", currTag)
      ;

    // Replace major package version placeholders
    for (const [pkg, v] of Object.entries(currVersions)) {
      if (!prevVersions[pkg] || prevVersions[pkg] === v) {
        upstreamSection = upstreamSection.replace(
          `{pkgrel:${pkg}}`,
          PATTERN_PKGREL.replace("{version}", v)
        );
      } else {
        upstreamSection = upstreamSection.replace(
          `{pkgrel:${pkg}}`,
          PATTERN_PKGREL_CHANGED.replace("{prev}", prevVersions[pkg]).replace("{new}", v)
        );
      }
    }

    return upstreamSection;
  } catch (error) {
    console.log(`Failed to build upstream section:\n${(error as Error).message}`);
    return "";
  }
}

/**
 * Groups packages into common and category-specific sets
 *
 * @param prev - Previous manifests
 * @param manifests - Current manifests
 * @returns Tuple containing [commonPackages, categoryPackages]
 */
function getPackageGroups(
  prev: Record<string, Manifest>,
  manifests: Record<string, Manifest>
): [string[], Record<string, string[]>] {
  const common = new Set<string>();
  const others: Record<string, Set<string>> = {};

  for (const key of Object.keys(OTHER_NAMES)) {
    others[key] = new Set<string>();
  }

  const npkg = getPackages(manifests);
  const ppkg = getPackages(prev);

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
    Object.fromEntries(Object.entries(others).map(([k, v]) => [k, Array.from(v).sort()]))
  ];
}

/**
 * Extracts version information from manifests, cleaning Fedora suffixes
 *
 * @param manifests - Mapping of image manifests
 * @returns Mapping of package names to cleaned version strings
 */
function getVersions(manifests: Record<string, Manifest>): Record<string, string> {
  const versions: Record<string, string> = {};
  const pkgs = getPackages(manifests);

  for (const imgPkgs of Object.values(pkgs)) {
    for (const [pkg, v] of Object.entries(imgPkgs)) {
      versions[pkg] = v.replace(FEDORA_PATTERN, "");
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
 * @param handwritten - Optional handwritten changelog content
 * @param target - Target branch/tag
 * @param pretty - Optional pretty title
 * @param workdir - Git working directory
 * @param prevManifests - Previous version manifests
 * @param manifests - Current version manifests
 * @returns Tuple containing [title, changelogContent]
 */
/**
 * Generates the complete changelog with all sections
 *
 * Orchestrates the generation of a comprehensive changelog by:
 * 1. Identifying package groups (common and category-specific)
 * 2. Extracting version information from manifests
 * 3. Computing git commit history between versions
 * 4. Including upstream base image changes
 * 5. Calculating package changes for each category
 * 6. Formatting everything into markdown
 *
 * @param handwritten - Optional handwritten changelog content to prepend
 * @param target - Target branch/tag (e.g., 'stable', 'main')
 * @param pretty - Optional pretty title for the changelog
 * @param workdir - Git working directory for commit history extraction
 * @param prevManifests - Previous version manifests for Serpentine images
 * @param manifests - Current version manifests for Serpentine images
 * @param upstreamCurrManifests - Optional current upstream base image manifests
 * @param upstreamPrevManifests - Optional previous upstream base image manifests
 * @returns Tuple containing [title, changelogContent]
 *
 * @remarks
 * The function generates a multi-section changelog including:
 * - Major package versions (kernel, firmware, mesa, etc.)
 * - Git commit history
 * - Upstream base image changes (if manifests provided)
 * - Common package changes (across all images)
 * - Category-specific changes (desktop, deck, KDE, GNOME, NVIDIA)
 */
async function generateChangelog(
  handwritten: string | null,
  target: string,
  pretty: string | null,
  workdir: string,
  prevManifests: Record<string, Manifest>,
  manifests: Record<string, Manifest>,
  upstreamCurrManifests?: Record<string, Manifest>,
  upstreamPrevManifests?: Record<string, Manifest>
): Promise<[string, string]> {
  const [common, others] = getPackageGroups(prevManifests, manifests);
  const versions = getVersions(manifests);
  const prevVersions = getVersions(prevManifests);

  // Note: prev and curr should be passed in from main to match Python behavior
  // But for compatibility, we'll call getTags here too
  const [prev, curr] = getTags(target, manifests);

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

  // Add upstream base image changes (pass pre-fetched manifests to avoid redundant network calls)
  try {
    const upstream = await getUpstreamSection(target, upstreamCurrManifests, upstreamPrevManifests);
    changes += upstream;
  } catch (error) {
    console.log(`Error adding upstream section: ${(error as Error).message}`);
  }

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
 * 5. Fetches upstream base image manifests (current and previous) for comparison
 * 6. Generates comprehensive changelog with all sections
 * 7. Writes output to console and optionally to files
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

  // Fetch upstream manifests (both current and previous) to avoid redundant calls
  console.log(`\n=== Fetching upstream base image manifests ===`);
  const upstreamCurrManifests = await getUpstreamManifests(finalTarget);

  let upstreamPrevManifests: Record<string, Manifest> = {};
  if (Object.keys(upstreamCurrManifests).length > 0) {
    try {
      // Derive upstream tags from the current upstream manifest
      const [upstreamPrev] = getTags(finalTarget, upstreamCurrManifests);
      console.log(`Fetching upstream ${upstreamPrev} manifests for comparison...`);
      upstreamPrevManifests = await getUpstreamManifests(upstreamPrev);
    } catch (error) {
      console.log(`Could not fetch upstream previous manifests: ${(error as Error).message}`);
    }
  }

  // Generate changelog with all pre-fetched manifests
  console.log(`\n=== Generating changelog ===`);
  const [title, changelog] = await generateChangelog(
    options.handwritten || null,
    finalTarget,
    options.pretty || null,
    options.workdir,
    prevManifests,
    manifests,
    upstreamCurrManifests,
    upstreamPrevManifests,
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
if (import.meta.main) {
  main().catch(console.error);
}