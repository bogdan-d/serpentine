# Serpentine

[![Build Status](https://github.com/bogdan-d/serpentine/actions/workflows/build.yml/badge.svg)](https://github.com/bogdan-d/serpentine/actions/)

---

## Introduction

Welcome to Serpentine! This project is a developer-focused immutable OS variant built on [Bazzite](https://bazzite.gg/) (a gaming-focused Fedora Atomic desktop), using modern container-based image building techniques.

While this is a personal daily driver OS, tailored for development workflows with gaming capabilities, it's also publicly available as a learning resource or a starting point for your own custom OS image. You can see how certain customizations are made, fork the project to suit your needs, or draw inspiration for your own builds.

**Disclaimer:** This project includes personal configurations that may not be suitable for everyone. It is recommended to review the customizations before use.

---

## Core Concept

*   **Base Image:** Built on `ghcr.io/ublue-os/bazzite` (Fedora Kinoite with Bazzite's gaming enhancements and developer experience tools). Supports both standard and NVIDIA variants.
*   **Immutable & Atomic:** Leveraging `bootc` and `rpm-ostree`, the system is reliable, predictable, and robust. Updates are atomic, and you can easily roll back to previous versions.
*   **Developer-Focused:** Enhanced with container tools (Docker, Podman, Incus), virtualization (QEMU, libvirt, virt-manager), profiling tools (bpftrace, sysprof), and comprehensive development utilities.
*   **Gaming-Ready:** Inherits Bazzite's gaming optimizations including Steam, Gamescope, MangoHud, and Wine/Proton compatibility layers.
*   **Flatpak-centric:** Most user applications are intended to be installed as Flatpaks. The base image modifications are for tools, system-level configurations, and packages that are not suitable for Flatpak.

---

## Features & Customizations

Here's a summary of what makes Serpentine unique:

### System-Level Changes

*   **Desktop Environment:** KDE Plasma (Kinoite) with restored logout and user switching functionality
*   **Display Manager:** SDDM with Deck-specific configurations removed for standard desktop login experience
*   **Google Account Integration:** Modified KDE Google Account provider for improved Google Drive integration
*   **Enabled Services:** `input-remapper.service` for custom input mapping, `uupd.timer` for system updates
*   **Boot Options:** Toggle between Desktop Mode and Steam Game Mode via custom Just commands

### Developer Tools & Packages

Comprehensive development environment with:

*   **Containers & Orchestration:** Docker CE, Podman, Incus, containerd, buildah tools
*   **Virtualization:** QEMU, libvirt, virt-manager, virt-viewer, virt-v2v, kcli
*   **Profiling & Debugging:** bpftrace, bpftop, bcc, sysprof, trace-cmd, tiptop, iotop
*   **Build Tools:** ccache, flatpak-builder, osbuild-selinux, umoci, podman-bootc
*   **Management Interfaces:** Cockpit suite (machines, podman, ostree, selinux, storage)
*   **Utilities:** android-tools, usbmuxd, ydotool, p7zip, numactl

### AMD GPU Support

*   **ROCm Stack:** rocm-hip, rocm-opencl, rocm-smi for AMD GPU compute workloads
*   Full support for Southern Islands and newer GPUs

### Default Flatpaks

Comes with a curated selection of applications across categories:

*   **Development:** Pods, Podman Desktop, Flatseal, Warehouse, BoxBuddy
*   **Browsers:** Zen Browser, Google Chrome
*   **Communication:** Vesktop (Discord), Signal, Telegram
*   **Productivity:** LibreOffice, Joplin, Pinta, GIMP, Inkscape, Blender
*   **Media:** VLC, Kdenlive, Krita, Kooha (screen recorder)
*   **Gaming:** ProtonUp-Qt, Bottles, WineZGUI, Protontricks
*   **Utilities:** Bitwarden, Cryptomator, LocalSend, qBittorrent, Warp, EasyEffects
*   **System:** Mission Center, Cockpit Client, Fedora Media Writer
*   **Vulkan Layers:** MangoHud, OBSVkCapture, vkBasalt

### Custom Just Commands

Extended system management via `just` command runner:

*   `just install-fonts` - Install additional fonts via Homebrew
*   `just toggle-gamemode` - Switch between Desktop and Steam Game Mode

### Package Management Strategy

*   **DNF5:** System packages and development tools
*   **Flatpak:** User applications and desktop software
*   **Homebrew:** Fonts, CLI tools, and supplementary utilities

---

## How to Use

You can switch an existing `bootc`-compatible system (like Fedora, Bazzite, or Bluefin) to this image.

**Rebase Command:**
```bash
sudo rpm-ostree rebase ostree-image-signed:docker://ghcr.io/bogdan-d/serpentine:stable
```

After the command completes, reboot your system. You can check the status at any time with `rpm-ostree status` or `sudo bootc status`.

**Available Tags:**
*   `stable` - Stable builds from the main branch
*   `latest` - Latest development builds

---

## Building from Source

If you want to customize this image or build it yourself, you can use the provided build system.

### Prerequisites

*   A container runtime like [Podman](https://podman.io/)
*   [Just](https://github.com/casey/just), a command runner

### Build Instructions

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/bogdan-d/serpentine.git
    cd serpentine
    ```

2.  **Build the container image:**
    ```bash
    just build bazzite-deck kinoite
    ```

    For NVIDIA variant:
    ```bash
    just build bazzite-deck-nvidia kinoite
    ```

3.  **(Optional) Build a bootable ISO:**
    You can create an ISO for installation.
    ```bash
    just build-iso bazzite-deck kinoite
    ```
    The generated images will be in the root directory.

4.  **Test the image:**
    ```bash
    just run bazzite-deck kinoite
    ```

### Build System Overview

The build process uses a multi-stage Containerfile with modular scripts:

*   **`build_files/`** - Numbered scripts executed in order (00-*, 20-*, 40-*, etc.)
*   **`system_files/`** - Configuration overlays applied to the system
*   **Execution order:** `00-image-info.sh` → `20-install-apps.sh` → `40-services.sh` → `50-fix-opt.sh` → `60-clean-base.sh` → `99-build-initramfs.sh` → `999-cleanup.sh`

---

## Verification

These images are signed with [Sigstore](https://www.sigstore.dev/)'s [cosign](https://github.com/sigstore/cosign). You can verify the signature by downloading the `cosign.pub` file from this repo and running the following command:

```bash
cosign verify --key cosign.pub ghcr.io/bogdan-d/serpentine
```

---

## Project Structure

```
serpentine/
├── Containerfile              # Main build definition
├── Justfile                   # Build automation commands
├── build_files/               # Build scripts (executed in order)
│   ├── 00-image-info.sh      # Set image metadata
│   ├── 20-install-apps.sh    # Install packages
│   ├── 40-services.sh        # Enable/disable services
│   └── ...
├── system_files/              # System configuration overlays
│   ├── etc/                   # System configuration
│   │   └── ublue-os/
│   │       └── system_flatpaks # Default Flatpak list
│   └── usr/                   # User-level configurations
│       └── share/
│           └── ublue-os/
│               ├── just/      # Custom Just commands
│               └── homebrew/  # Brew bundles
├── disk_config/               # ISO configuration
└── spec_files/                # Custom RPM specs
```

---

## Acknowledgements

This project is made possible by the work of the open-source community. Special thanks to:

*   The [Universal Blue](https://universal-blue.org/) project and all its contributors
*   The [Bazzite](https://bazzite.gg/) project for the excellent gaming-focused base
*   The Fedora Project for Fedora Kinoite and Fedora Atomic Desktops
*   Inspiration from other custom OS projects like [VeneOS](https://github.com/Venefilyn/veneos), [Agate](https://github.com/fptbb/agate), [amyos](https://github.com/astrovm/amyos), and [m2os](https://github.com/m2Giles/m2os)

---

## License

This project is licensed under the Apache License 2.0. See the [LICENSE](LICENSE) file for details.

---

## Additional Resources

*   **Documentation:** See [AGENTS.md](AGENTS.md) for detailed development guidelines
*   **Setup Guide:** See [SETUP.md](SETUP.md) for initial configuration
*   **Universal Blue:** [https://universal-blue.org/](https://universal-blue.org/)
*   **Bazzite Documentation:** [https://docs.bazzite.gg/](https://docs.bazzite.gg/)
