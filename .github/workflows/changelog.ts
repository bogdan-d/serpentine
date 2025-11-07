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
  /** Repository tags associated with the manifest */
  RepoTags: string[];
  /** Container labels including package information */
  Labels?: Record<string, string>;
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
  gnome: "### Gnome Images\n| | Name | Previous | New |\n| --- | --- | --- | --- |{changes}\n\n",
  nvidia: "### Nvidia Images\n| | Name | Previous | New |\n| --- | --- | --- | --- |{changes}\n\n",
};

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
| **Gnome** | {pkgrel:gnome-control-center-filesystem} |
| **KDE** | {pkgrel:plasma-desktop} |
| **[HHD](https://github.com/hhd-dev/hhd)** | {pkgrel:hhd} |

{changes}

### How to rebase
For current users, type the following to rebase to this version:
\`\`\`bash
# For this branch (if latest):
bazzite-rollback-helper rebase {target}
# For this specific image:
bazzite-rollback-helper rebase {curr}
\`\`\`
`;

/** Default placeholder for handwritten changelog */
const HANDWRITTEN_PLACEHOLDER = `This is an automatically generated changelog for release \`{curr}\`.`;

/** Packages to exclude from detailed changelog to avoid redundancy */
const BLACKLIST_VERSIONS = [
  "kernel",
  "mesa-filesystem",
  "gamescope",
  "gnome-control-center-filesystem",
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
 * Fetches container manifests for a specific target tag
 *
 * @param target - The target tag to fetch manifests for
 * @returns Promise resolving to a mapping of image names to their manifests
 */
async function getManifests(target: string): Promise<Record<string, Manifest>> {
  const out: Record<string, Manifest> = {};
  const imgs = Array.from(getImages());

  for (let j = 0; j < imgs.length; j++) {
    const { img } = imgs[j];
    let output: string | null = null;

    console.log(`Getting ${img}:${target} manifest (${j + 1}/${imgs.length}).`);

    for (let i = 0; i < RETRIES; i++) {
      try {
        const result = await Bun.$`skopeo inspect ${REGISTRY}${img}:${target}`.text();
        output = result;
        break;
      } catch (error) {
        console.log(`Failed to get ${img}:${target}, retrying in ${RETRY_WAIT} seconds (${i + 1}/${RETRIES})`);
        await Bun.sleep(RETRY_WAIT * 1000);
      }
    }

    if (output === null) {
      console.log(`Failed to get ${img}:${target}, skipping`);
      continue;
    }

    try {
      out[img] = JSON.parse(output) as Manifest;
    } catch (error) {
      console.log(`Failed to parse JSON for ${img}:${target}: ${(error as Error).message}`);
    }
  }

  return out;
}

/**
 * Extracts version tags from manifests, finding current and previous versions
 *
 * @param target - The target branch/tag
 * @param manifests - Mapping of image manifests
 * @returns Tuple containing [previousTag, currentTag]
 * @throws Error if insufficient tags are found
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
 * Calculates package changes between two versions
 *
 * @param pkgs - List of packages to analyze
 * @param prev - Previous version mapping
 * @param curr - Current version mapping
 * @returns Formatted markdown string describing the changes
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
async function generateChangelog(
  handwritten: string | null,
  target: string,
  pretty: string | null,
  workdir: string,
  prevManifests: Record<string, Manifest>,
  manifests: Record<string, Manifest>
): Promise<[string, string]> {
  const [common, others] = getPackageGroups(prevManifests, manifests);
  const versions = getVersions(manifests);
  const prevVersions = getVersions(prevManifests);

  // Note: prev and curr should be passed in from main to match Python behavior
  // But for compatibility, we'll call getTags here too
  const [prev, curr] = getTags(target, manifests);

  if (!pretty) {
    // Generate pretty version since we dont have it
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

  let changes = "";
  changes += await getCommits(prevManifests, manifests, workdir);
  const commonChanges = calculateChanges(common, prevVersions, versions);
  if (commonChanges) {
    changes += COMMON_PAT.replace("{changes}", commonChanges);
  }
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
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options = parseArguments(args);

  const finalTarget = !options.target || options.target === "main" ? "stable" : options.target;

  const manifests = await getManifests(finalTarget);
  const [prev, curr] = getTags(finalTarget, manifests);
  console.log(`Previous tag: ${prev}`);
  console.log(` Current tag: ${curr}`);

  const prevManifests = await getManifests(prev);
  const [title, changelog] = await generateChangelog(
    options.handwritten || null,
    finalTarget,
    options.pretty || null,
    options.workdir,
    prevManifests,
    manifests,
  );

  console.log(`Changelog:\n# ${title}\n${changelog}`);
  console.log(`\nOutput:\nTITLE="${title}"\nTAG=${curr}`);

  if (options.changelogFile) {
    await Bun.write(options.changelogFile, changelog);
  }

  if (options.output) {
    await Bun.write(options.output, `TITLE="${title}"\nTAG=${curr}\n`);
  }
}

// Execute main function if this file is run directly
if (import.meta.main) {
  main().catch(console.error);
}