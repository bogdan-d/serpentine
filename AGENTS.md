# Serpentine Development Guidelines

## Architecture Overview

Serpentine is a developer-focused immutable OS variant built on Bazzite (gaming-focused Fedora). Uses multi-stage container builds (`Containerfile`) with modular scripts (`build_files/`) and system file overlays (`system_files/`) for configuration. Service boundaries: DNF5 for system packages, Flatpak for user apps, Homebrew for fonts, cli and everything else. Data flows from base image through numbered build scripts (00-* to 999-*) to final OSTree image.

### Base Technology Stack
- **Base OS**: Bazzite (Fedora Atomic - Kinoite)
- **Container Runtime**: bootc/rpm-ostree for immutable deployments
- **Build System**: Just (command runner) with Containerfile
- **Package Manager**: dnf5 with extensive COPR repository usage
- **Desktop Environment**: KDE Plasma (Kinoite)

### Image Variants
```
bazzite-deck               # Steam Deck/HTPC KDE
bazzite-deck-nvidia        # Deck KDE + NVIDIA
```

### Key Build Arguments
```dockerfile
BASE_IMAGE_NAME="kinoite"               # Desktop environment
IMAGE_FLAVOR="nvidia"                   # Hardware variant
KERNEL_FLAVOR="bazzite"                 # Custom kernel
FEDORA_VERSION="42"                     # Fedora version
```

## Build Process

Multi-stage build: scratch context stage copies `system_files/` and `build_files/`, main stage mounts context and runs `build.sh` orchestrator. Scripts execute in numeric order: `00-image-info.sh` sets metadata, `20-install-apps.sh` installs packages, `40-services.sh` enables services, `99-build-initramfs.sh` generates boot system. Use `set -euo pipefail` in scripts; GitHub Actions `::group::` for logging.

### Containerfile Structure
Multi-stage build with two main targets:
1. **bazzite-deck** - Steam Deck/HTPC variant
2. **bazzite-deck-nvidia** - NVIDIA GPU support

## Configuration Management

System configurations in `system_files/etc/skel/` (user templates), `system_files/etc/ublue-os/system_flatpaks` (Flatpak apps), `system_files/usr/share/ublue-os/homebrew/` (Brew bundles). User setup via hooks: `privileged-setup.hooks.d/20-dx.sh` for system changes (Docker group). Variants handled with conditional logic (e.g., `[[ "$IMAGE_NAME" == *nvidia* ]]`).

### Repository Structure
```
├── Containerfile             # Main build definition
├── Justfile                  # Build automation
├── build_files/              # Build helper scripts
├── system_files/             # System configurations
│   ├── deck/                 # Steam Deck configs
│   ├── nvidia/               # NVIDIA-specific configs
│   └── overrides/            # Global overrides
├── just_scripts/             # Just command implementations
├── installer/                # ISO creation templates
└── spec_files/               # Custom RPM package specs
```

### Package Management
```bash
# Primary COPR repositories
bazzite-org/bazzite           # Core Bazzite packages
bazzite-org/bazzite-multilib  # Multilib support
ublue-os/staging              # Universal Blue staging
ublue-os/packages             # Universal Blue packages
hhd-dev/hhd                   # Handheld daemon

# Key versionlocked packages
ostree, rpm-ostree, plymouth   # Core system
pipewire, wireplumber          # Audio stack
mesa, vulkan-drivers          # Graphics stack
```

## Development Workflows

Local testing: `podman build -t test .` then `podman run --rm -it test /bin/bash`. Full builds require CI with akmods. Installation: `rpm-ostree rebase ostree-image-signed:docker://ghcr.io/bogdan-d/serpentine:stable`. Debugging: `journalctl -u service-name`, `systemctl --global status service-name` for user services. Validation: `just just-check` for syntax.

### Building Images
```bash
# Build Steam Deck image
just build bazzite-deck kinoite

# Build NVIDIA variant
just build bazzite-deck-nvidia kinoite
```

### Testing Changes
```bash
# Validate Just syntax
just just-check

# Run container for testing
just run bazzite-deck kinoite

# Build and test ISO
just build-iso bazzite-deck kinoite && just run-iso bazzite-deck kinoite
```

## Key Conventions

Numeric script prefixes ensure execution order (e.g., `20-` before `40-`). Just commands imported via `import "/usr/share/ublue-os/just/95-serpentine.just"`. Setup hooks use version control (`version-script name scope version`). Variant-specific configs (KDE/NVIDIA) in build scripts. External repos: COPR for ublue packages, Microsoft for VS Code, Docker Inc. for Docker CE.

### Configuration Patterns
1. **Shared configs** in `system_files/*/shared/`
2. **DE-specific** in `system_files/*/kinoite/`
3. **Variant-specific** in appropriate subdirectories
4. **Global overrides** in `system_files/overrides/`

## Integration Points

Cross-component communication via setup hooks (system → user). Just commands extend base functionality. Flatpak system apps installed during user setup. Container networking requires `iptable_nat` module loading.

### Key Services
```bash
bazzite-autologin.service      # Deck auto-login
bazzite-hardware-setup.service # Hardware detection
bazzite-flatpak-manager.service # Flatpak management
hhd.service                    # Handheld daemon
wireplumber-workaround.service # Audio fixes
```

## Build/Test Commands

**Primary build tool**: `just` (command runner)
- `just --list` - List all available commands
- `just just-check` - Validate Just syntax across all files (ALWAYS run before submitting)
- `just build <target>` - Build container images (CI only - requires akmods kernel images)
- `just build-iso <target>` - Build ISO images (CI only)
- `just list-images` - Show local container images
- `just clean-images` - Cleanup local images

## Code Style Guidelines

**Formatting**:
- Line length: Maximum 120 characters
- No trailing whitespace
- Files must end with newline character
- Blank lines required between different list groups
- Blank line required after section headers

**Imports & Types**:
- Use existing patterns in files for import organization
- Follow shell script conventions in `.sh` files
- Use Just syntax patterns from existing Justfiles
- Maintain consistency with RPM spec file formats

**Branch Naming** (CRITICAL - no "/" characters):
- `feat-<description>` - New features
- `fix-<issue-number>` - Bug fixes
- `docs-<description>` - Documentation updates
- `refactor-<component>` - Code refactoring

**Naming Conventions**:
- Use kebab-case for branch names and file names
- Follow existing patterns for variable names in scripts
- Maintain consistency with RPM package naming conventions

**File Organization**:
- `Justfile` - Main build automation
- `system_files/` - System configuration by variant (deck/nvidia)
- `just_scripts/` - Build helper scripts
- `spec_files/` - RPM spec files for custom packages

### Custom Packages
- **bazzite-kernel**: Custom Linux kernel
- **steamdeck-kde-presets**: KDE theming
- **gamescope-session-plus**: Enhanced gamescope
- **hhd**: Handheld input daemon

### Gaming Stack
- **Steam**: Pre-installed with custom launcher scripts
- **Gamescope**: Compositor for gaming mode
- **MangoHud**: Performance overlay
- **vkBasalt**: Post-processing layer
- **LatencyFleX**: Frame pacing
- **Wine/Proton**: Compatibility layers

### Hardware Support
- **AMD**: Full ROCm/HIP support, Southern Islands GPUs
- **NVIDIA**: Proprietary drivers (NVIDIA variants)
- **Controllers**: xone (Xbox), extensive handheld support
- **Display**: DisplayLink, HDR, variable refresh rate
- **Audio**: PipeWire with custom configurations

**Error Handling**:
- Use existing error handling patterns in shell scripts
- Follow Just error handling conventions
- Maintain consistency with CI/CD workflow error patterns

**Development Notes**:
- Full builds require CI environment with specialized akmods kernel images
- Focus development on configuration files, scripts, and system files
- Most development can be done locally without full container builds
- Use `just just-check` to validate syntax changes (expected to show warnings about unknown attributes)

**Critical Constraints**:
- Branch names cannot contain "/" characters (breaks Docker tags)
- CI builds take 60+ minutes - NEVER cancel validation workflows
- Local builds fail without specialized akmods kernel images

## Extension Guidelines

### Adding New Features
1. **Determine scope**: Deck vs NVIDIA
2. **Add packages** to appropriate Containerfile stage
3. **Create configs** in relevant `system_files/` directory
4. **Add services** if needed
5. **Update Just commands** if new functionality required

### Configuration Files
- **Deck settings**: `system_files/deck/*/etc/`
- **User configs**: `system_files/*/usr/share/` or `/etc/skel/`
- **Services**: `system_files/*/usr/lib/systemd/system/`
- **Just commands**: `system_files/*/usr/share/ublue-os/just/`

### Common Patterns

#### Adding COPR Packages
```dockerfile
# In appropriate RUN instruction
dnf5 -y copr enable username/repo
dnf5 -y install package-name
# Remember to disable copr in cleanup
dnf5 -y copr disable username/repo
```

#### System Services
```bash
# Enable service
systemctl enable service-name

# Create override
mkdir -p /etc/systemd/system/service.service.d/
echo "[Service]" > override.conf
```

#### Desktop Integration
```bash
# KDE: Copy to /usr/share/applications/
# Update /etc/skel/ for new user defaults
```

### Security Considerations
- **SELinux**: Enforced by default
- **Secure boot**: Custom key enrollment supported
- **Image signing**: Cosign verification available
- **Immutable base**: Changes via package layering only

### Performance Optimizations
- **ZRAM**: 4GB compressed swap (Deck variant)
- **CPU schedulers**: LAVD/BORE for gaming
- **I/O scheduler**: Kyber for responsiveness
- **Kernel parameters**: Gaming-optimized defaults