from itertools import product
import subprocess
import json
import time
from typing import Any
import re
from collections import defaultdict

BASE_IMAGE_NAME = "serpentine"
AUTHOR = "bogdan-d"
REGISTRY = f"docker://ghcr.io/{AUTHOR}/"

IMAGES = [
    BASE_IMAGE_NAME,
    f"{BASE_IMAGE_NAME}-nvidia",
]

# Upstream (base) image used to build Serpentine
UPSTREAM_IMAGE = "ublue-os/bazzite-deck"

# Container registry URL for upstream
UPSTREAM_REGISTRY = "docker://ghcr.io/"

# URL template for upstream releases
UPSTREAM_RELEASE_URL = "https://github.com/ublue-os/bazzite/releases/tag/{upstream_tag}"

RETRIES = 3
RETRY_WAIT = 5
FEDORA_PATTERN = re.compile(r"\.fc\d\d")
STABLE_START_PATTERN = re.compile(r"\d\d\.\d")
OTHER_START_PATTERN = lambda target: re.compile(rf"{target}-\d\d\.\d")

PATTERN_ADD = "\n| ✨ | {name} | | {version} |"
PATTERN_CHANGE = "\n| 🔄 | {name} | {prev} | {new} |"
PATTERN_REMOVE = "\n| ❌ | {name} | {version} | |"
PATTERN_PKGREL_CHANGED = "{prev} ➡️ {new}"
PATTERN_PKGREL = "{version}"
COMMON_PAT = "### All Images\n| | Name | Previous | New |\n| --- | --- | --- | --- |{changes}\n\n"
OTHER_NAMES = {
    "desktop": "### Desktop Images\n| | Name | Previous | New |\n| --- | --- | --- | --- |{changes}\n\n",
    "deck": "### Deck Images\n| | Name | Previous | New |\n| --- | --- | --- | --- |{changes}\n\n",
    "kde": "### KDE Images\n| | Name | Previous | New |\n| --- | --- | --- | --- |{changes}\n\n",
    "nvidia": "### Nvidia Images\n| | Name | Previous | New |\n| --- | --- | --- | --- |{changes}\n\n",
}

# Template for upstream base image changes section with major packages
# Note: Double braces {{pkgrel:...}} are escaped for .format() call, then replaced with single braces
UPSTREAM_PAT = f"""### Upstream Base Image [{UPSTREAM_IMAGE}]({UPSTREAM_RELEASE_URL})
**Release Date:** {{upstream_created}}

#### Major packages (from upstream: {UPSTREAM_IMAGE})
| Name | Version |
| --- | --- |
| **Kernel** | {{{{pkgrel:kernel}}}} |
| **Firmware** | {{{{pkgrel:atheros-firmware}}}} |
| **Mesa** | {{{{pkgrel:mesa-filesystem}}}} |
| **Gamescope** | {{{{pkgrel:gamescope}}}} |
| **KDE** | {{{{pkgrel:plasma-desktop}}}} |
| **[HHD](https://github.com/hhd-dev/hhd)** | {{{{pkgrel:hhd}}}} |

#### Package changes (from upstream: {UPSTREAM_IMAGE})
| | Name | Previous | New |
| --- | --- | --- | --- |{{changes}}

"""

# Template for commits section
COMMITS_FORMAT = (
    "### Commits\n| Hash | Subject | Author |\n| --- | --- | --- |{commits}\n\n"
)

# Template for individual commit entries
COMMIT_FORMAT = "\n| **[{short}](https://github.com/" + AUTHOR + "/" + BASE_IMAGE_NAME + "/commit/{hash})** | {subject} | {author} |"

# Template for changelog title
CHANGELOG_TITLE = "{tag}: {pretty}"

# Main changelog template
CHANGELOG_FORMAT = """\
{handwritten}

From previous `{target}` version `{prev}` there have been the following changes. **One package per new version shown.**

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
```bash
# For this branch (if latest):
serpentine-rollback-helper rebase {target}
# For this specific image:
serpentine-rollback-helper rebase {curr}
```
"""
HANDWRITTEN_PLACEHOLDER = """\
This is an automatically generated changelog for release `{curr}`."""

BLACKLIST_VERSIONS = [
    "kernel",
    "mesa-filesystem",
    "gamescope",
    "plasma-desktop",
    "atheros-firmware",
]


def get_images():
    for img in IMAGES:
        if "deck" in img:
            base = "deck"
        else:
            base = "desktop"

        if "gnome" in img:
            de = "gnome"
        else:
            de = "kde"

        yield img, base, de


def get_manifests(target: str):
    out = {}
    imgs = list(get_images())
    for j, (img, _, _) in enumerate(imgs):
        print(f"Getting {img}:{target} manifest ({j+1}/{len(imgs)}).")
        ref = REGISTRY + img + ":" + target
        manifest = inspect_image(ref)
        if manifest is None:
            print(f"Failed to get {img}:{target}, skipping")
            continue
        out[img] = manifest
    return out


def get_upstream_manifests(target: str):
    """
    Fetches upstream (base) image manifests for a specific target/tag.

    Returns a mapping with a single entry for the upstream image so that we can
    reuse existing helpers that expect a dict structure.
    """
    out = {}
    ref = UPSTREAM_REGISTRY + UPSTREAM_IMAGE + ":" + target
    print(f"Getting upstream {UPSTREAM_IMAGE}:{target} manifest.")
    manifest = inspect_image(ref)
    if manifest:
        out[UPSTREAM_IMAGE] = manifest
    else:
        print(f"Failed to get upstream {UPSTREAM_IMAGE}:{target}, skipping upstream section")
    return out


def get_tags(target: str, manifests: dict[str, Any]):
    tags = set()

    # Select random manifest to get reference tags from
    first = next(iter(manifests.values()))
    for tag in first["RepoTags"]:
        # Tags ending with .0 should not exist
        if tag.endswith(".0"):
            continue
        if target != "stable":
            if re.match(OTHER_START_PATTERN(target), tag):
                tags.add(tag)
        else:
            if re.match(STABLE_START_PATTERN, tag):
                tags.add(tag)

    # Remove tags not present in all images
    for manifest in manifests.values():
        for tag in list(tags):
            if tag not in manifest["RepoTags"]:
                tags.remove(tag)

    tags = list(sorted(tags))
    assert len(tags) >= 2, "No current and previous tags found"
    return tags[-2], tags[-1]


def get_packages(manifests: dict[str, Any]):
    packages = {}
    for img, manifest in manifests.items():
        try:
            packages[img] = json.loads(manifest["Labels"]["dev.hhd.rechunk.info"])[
                "packages"
            ]
        except Exception as e:
            print(f"Failed to get packages for {img}:\n{e}")
    return packages


def inspect_image(ref: str):
    output = None
    for i in range(RETRIES):
        try:
            output = subprocess.run(
                ["skopeo", "inspect", ref],
                check=True,
                stdout=subprocess.PIPE,
            ).stdout
            break
        except subprocess.CalledProcessError:
            if i < RETRIES - 1:
                print(
                    f"Failed to inspect {ref}, retrying in {RETRY_WAIT} seconds ({i+1}/{RETRIES})"
                )
                time.sleep(RETRY_WAIT)
    if output is None:
        return None
    try:
        return json.loads(output)
    except Exception:
        return None


def get_upstream_section(
    target: str,
    upstream_curr_manifests: dict[str, Any] | None = None,
    upstream_prev_manifests: dict[str, Any] | None = None,
):
    """
    Builds the upstream changes section for the changelog.

    Compares the upstream base image packages between its previous and current tag
    to show what changed in the base layer that Serpentine is built on top of.
    """
    try:
        # Fetch current upstream manifests if not provided
        upstream_curr = upstream_curr_manifests or get_upstream_manifests(target)
        if not upstream_curr:
            return ""

        # Derive previous and current tags from upstream manifest
        try:
            prev_tag, curr_tag = get_tags(target, upstream_curr)
            print(f"Upstream previous tag: {prev_tag}")
            print(f"Upstream  current tag: {curr_tag}")
        except Exception as e:
            print(f"Failed to determine upstream tags: {e}")
            return ""

        # Fetch previous upstream manifests if not provided
        upstream_prev = upstream_prev_manifests or get_upstream_manifests(prev_tag)

        # Extract package versions from both manifests
        prev_versions = get_versions(upstream_prev)
        curr_versions = get_versions(upstream_curr)

        # Combine all package names from both versions
        pkgs = sorted(set(prev_versions.keys()) | set(curr_versions.keys()))

        # Calculate and format package changes
        chg = calculate_changes(pkgs, prev_versions, curr_versions)
        if not chg:
            return ""

        # Extract upstream creation date
        first = next(iter(upstream_curr.values()))
        from datetime import datetime
        upstream_created = "unknown"
        if "Created" in first and first["Created"]:
            try:
                # Try parsing ISO format
                upstream_created = datetime.strptime(first["Created"], "%Y-%m-%dT%H:%M:%SZ").strftime("%a %b %d %H:%M:%S %Y")
            except Exception:
                try:
                    # Fallback to UNIX timestamp
                    upstream_created = time.strftime("%a %b %d %H:%M:%S %Y", time.gmtime(int(first["Created"])))
                except Exception:
                    upstream_created = "unknown"

        # Build upstream section with major packages
        upstream_section = UPSTREAM_PAT.format(
            changes=chg,
            upstream_tag=curr_tag,
            upstream_created=upstream_created,
        )

        # Replace major package version placeholders
        for pkg, v in curr_versions.items():
            if pkg not in prev_versions or prev_versions[pkg] == v:
                upstream_section = upstream_section.replace(
                    "{pkgrel:" + pkg + "}", PATTERN_PKGREL.format(version=v)
                )
            else:
                upstream_section = upstream_section.replace(
                    "{pkgrel:" + pkg + "}",
                    PATTERN_PKGREL_CHANGED.format(prev=prev_versions[pkg], new=v),
                )

        return upstream_section
    except Exception as e:
        print(f"Failed to build upstream section:\n{e}")
        return ""


def get_package_groups(prev: dict[str, Any], manifests: dict[str, Any]):
    common = set()
    others = {k: set() for k in OTHER_NAMES.keys()}

    npkg = get_packages(manifests)
    ppkg = get_packages(prev)

    keys = set(npkg.keys()) | set(ppkg.keys())
    pkg = defaultdict(set)
    for k in keys:
        pkg[k] = set(npkg.get(k, {})) | set(ppkg.get(k, {}))

    # Find common packages
    first = True
    for img, base, de in get_images():
        if img not in pkg:
            continue

        if first:
            for p in pkg[img]:
                common.add(p)
        else:
            for c in common.copy():
                if c not in pkg[img]:
                    common.remove(c)

        first = False

    # Find other packages
    for t, other in others.items():
        first = True
        for img, base, de in get_images():
            if img not in pkg:
                continue

            if t == "nvidia" and "nvidia" not in base:
                continue
            if t == "kde" and de != "kde":
                continue
            if t == "gnome" and de != "gnome":
                continue
            if t == "deck" and base != "deck":
                continue
            if t == "desktop" and base == "deck":
                continue

            if first:
                for p in pkg[img]:
                    if p not in common:
                        other.add(p)
            else:
                for c in other.copy():
                    if c not in pkg[img]:
                        other.remove(c)

            first = False

    return sorted(common), {k: sorted(v) for k, v in others.items()}


def get_versions(manifests: dict[str, Any]):
    versions = {}
    pkgs = get_packages(manifests)
    for img_pkgs in pkgs.values():
        for pkg, v in img_pkgs.items():
            versions[pkg] = re.sub(FEDORA_PATTERN, "", v)
    return versions


def calculate_changes(pkgs: list[str], prev: dict[str, str], curr: dict[str, str]):
    added = []
    changed = []
    removed = []

    blacklist_ver = set([curr.get(v, None) for v in BLACKLIST_VERSIONS])

    for pkg in pkgs:
        # Clearup changelog by removing mentioned packages
        if pkg in BLACKLIST_VERSIONS:
            continue
        if pkg in curr and curr.get(pkg, None) in blacklist_ver:
            continue
        if pkg in prev and prev.get(pkg, None) in blacklist_ver:
            continue

        if pkg not in prev:
            added.append(pkg)
        elif pkg not in curr:
            removed.append(pkg)
        elif prev[pkg] != curr[pkg]:
            changed.append(pkg)

        blacklist_ver.add(curr.get(pkg, None))
        blacklist_ver.add(prev.get(pkg, None))

    out = ""
    for pkg in added:
        out += PATTERN_ADD.format(name=pkg, version=curr[pkg])
    for pkg in changed:
        out += PATTERN_CHANGE.format(name=pkg, prev=prev[pkg], new=curr[pkg])
    for pkg in removed:
        out += PATTERN_REMOVE.format(name=pkg, version=prev[pkg])
    return out


def get_commits(prev_manifests, manifests, workdir: str | None):
    """
    Extracts git commit history between two versions.

    Returns empty string if workdir is None or if git operations fail.
    """
    if not workdir:
        return ""

    try:
        start = next(iter(prev_manifests.values()))["Labels"][
            "org.opencontainers.image.revision"
        ]
        finish = next(iter(manifests.values()))["Labels"][
            "org.opencontainers.image.revision"
        ]

        commits = subprocess.run(
            [
                "git",
                "-C",
                workdir,
                "log",
                "--pretty=format:%H|%h|%an|%s",
                f"{start}..{finish}",
            ],
            check=True,
            stdout=subprocess.PIPE,
        ).stdout.decode("utf-8")

        out = ""
        for commit in commits.split("\n"):
            if not commit:
                continue
            parts = commit.split("|")
            if len(parts) < 4:
                continue
            commit_hash, short, author, subject = parts

            if subject.lower().startswith("merge"):
                continue

            out += (
                COMMIT_FORMAT.replace("{short}", short)
                .replace("{subject}", subject)
                .replace("{hash}", commit_hash)
                .replace("{author}", author)
            )

        if out:
            return COMMITS_FORMAT.format(commits=out)
        return ""
    except Exception as e:
        print(f"Failed to get commits:\n{e}")
        return ""


def generate_changelog(
    handwritten: str | None,
    target: str,
    pretty: str | None,
    workdir: str | None,
    prev_manifests,
    manifests,
    upstream_curr_manifests: dict[str, Any] | None = None,
    upstream_prev_manifests: dict[str, Any] | None = None,
):
    common, others = get_package_groups(prev_manifests, manifests)
    versions = get_versions(manifests)
    prev_versions = get_versions(prev_manifests)

    prev, curr = get_tags(target, manifests)

    if not pretty:
        # Generate pretty version since we dont have it
        try:
            finish: str = next(iter(manifests.values()))["Labels"][
                "org.opencontainers.image.revision"
            ]
        except Exception as e:
            print(f"Failed to get finish hash:\n{e}")
            finish = ""

        # Remove .0 from curr
        curr_pretty = re.sub(r"\.\d{1,2}$", "", curr)
        # Remove target- from curr
        curr_pretty = re.sub(rf"^[a-z]+-", "", curr_pretty)
        pretty = target.capitalize() + " (F" + curr_pretty
        if finish and target != "stable":
            pretty += ", #" + finish[:7]
        pretty += ")"

    title = CHANGELOG_TITLE.format_map(defaultdict(str, tag=curr, pretty=pretty))

    changelog = CHANGELOG_FORMAT

    changelog = (
        changelog.replace(
            "{handwritten}", handwritten if handwritten else HANDWRITTEN_PLACEHOLDER
        )
        .replace("{target}", target)
        .replace("{prev}", prev)
        .replace("{curr}", curr)
    )

    for pkg, v in versions.items():
        if pkg not in prev_versions or prev_versions[pkg] == v:
            changelog = changelog.replace(
                "{pkgrel:" + pkg + "}", PATTERN_PKGREL.format(version=v)
            )
        else:
            changelog = changelog.replace(
                "{pkgrel:" + pkg + "}",
                PATTERN_PKGREL_CHANGED.format(prev=prev_versions[pkg], new=v),
            )

    changes = ""
    changes += get_commits(prev_manifests, manifests, workdir)

    # Add upstream base image changes (pass pre-fetched manifests to avoid redundant network calls)
    try:
        upstream = get_upstream_section(target, upstream_curr_manifests, upstream_prev_manifests)
        changes += upstream
    except Exception as e:
        print(f"Error adding upstream section: {e}")

    common = calculate_changes(common, prev_versions, versions)
    if common:
        changes += COMMON_PAT.format(changes=common)
    for k, v in others.items():
        chg = calculate_changes(v, prev_versions, versions)
        if chg:
            changes += OTHER_NAMES[k].format(changes=chg)

    changelog = changelog.replace("{changes}", changes)

    return title, changelog


def main():
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("target", nargs="?", default=None, help="Target tag (default: stable)")
    parser.add_argument("output", nargs="?", default=None, help="Output environment file (optional)")
    parser.add_argument("changelog", nargs="?", default=None, help="Output changelog file (optional)")
    parser.add_argument("--pretty", default=None, help="Subject for the changelog")
    parser.add_argument("--workdir", default=".", help="Git directory for commits (default: current directory)")
    parser.add_argument("--handwritten", default=None, help="Handwritten changelog")
    args = parser.parse_args()

    # Remove refs/tags, refs/heads, refs/remotes e.g.
    # Tags cannot include / anyway.
    if args.target is None:
        target = "stable"
    else:
        target = args.target.split("/")[-1]

    if target == "main":
        target = "stable"

    # Fetch current Serpentine manifests
    print(f"\n=== Fetching Serpentine {target} manifests ===")
    manifests = get_manifests(target)
    prev, curr = get_tags(target, manifests)
    print(f"Previous tag: {prev}")
    print(f" Current tag: {curr}")

    # Fetch previous Serpentine manifests
    print(f"\n=== Fetching Serpentine {prev} manifests ===")
    prev_manifests = get_manifests(prev)

    # Fetch upstream manifests (both current and previous) to avoid redundant calls
    print(f"\n=== Fetching upstream base image manifests ===")
    upstream_curr_manifests = get_upstream_manifests(target)

    upstream_prev_manifests = {}
    if upstream_curr_manifests:
        try:
            # Derive upstream tags from the current upstream manifest
            upstream_prev_tag, _ = get_tags(target, upstream_curr_manifests)
            print(f"Fetching upstream {upstream_prev_tag} manifests for comparison...")
            upstream_prev_manifests = get_upstream_manifests(upstream_prev_tag)
        except Exception as e:
            print(f"Could not fetch upstream previous manifests: {e}")

    # Generate changelog with all pre-fetched manifests
    print(f"\n=== Generating changelog ===")
    title, changelog = generate_changelog(
        args.handwritten,
        target,
        args.pretty,
        args.workdir,
        prev_manifests,
        manifests,
        upstream_curr_manifests,
        upstream_prev_manifests,
    )

    print(f"\nChangelog:\n# {title}\n{changelog}")
    print(f'\nOutput:\nTITLE="{title}"\nTAG={curr}')

    if args.changelog:
        with open(args.changelog, "w") as f:
            f.write(changelog)
        print(f"Changelog written to: {args.changelog}")

    if args.output:
        with open(args.output, "w") as f:
            f.write(f'TITLE="{title}"\nTAG={curr}\n')
        print(f"Output variables written to: {args.output}")


if __name__ == "__main__":
    main()
