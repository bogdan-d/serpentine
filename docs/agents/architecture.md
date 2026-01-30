# Architecture

## Overview

Serpentine uses multi-stage container builds (`Containerfile`) with modular scripts (`build_files/`) and system file overlays (`system_files/`) for configuration. Data flows from base image through numbered build scripts (00-* to 999-*) to final OSTree image.

## Base Technology Stack

- **Base OS**: Bazzite (Fedora Atomic - Kinoite)
- **Container Runtime**: bootc/rpm-ostree for immutable deployments
- **Build System**: Just (command runner) with Containerfile
- **Package Manager**: dnf5 with extensive COPR repository usage
- **Desktop Environment**: KDE Plasma (Kinoite)

## Image Variants

```
bazzite-deck               # Steam Deck/HTPC KDE
bazzite-deck-nvidia        # Deck KDE + NVIDIA
```

## Key Build Arguments

```dockerfile
BASE_IMAGE_NAME="kinoite"               # Desktop environment
IMAGE_FLAVOR="nvidia"                   # Hardware variant
KERNEL_FLAVOR="bazzite"                 # Custom kernel
FEDORA_VERSION="42"                     # Fedora version
```

## Build Process

Multi-stage build: scratch context stage copies `system_files/` and `build_files/`, main stage mounts context and runs `build.sh` orchestrator. Scripts execute in numeric order: `00-image-info.sh` sets metadata, `20-install-apps.sh` installs packages, `40-services.sh` enables services, `99-build-initramfs.sh` generates boot system. Use `set -euo pipefail` in scripts; GitHub Actions `::group::` for logging.

## Containerfile Structure

Multi-stage build with two main targets:
1. **bazzite-deck** - Steam Deck/HTPC variant
2. **bazzite-deck-nvidia** - NVIDIA GPU support
