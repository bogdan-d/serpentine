# Configuration Management

## System Configurations

System configurations in `system_files/etc/skel/` (user templates), `system_files/etc/ublue-os/system_flatpaks` (Flatpak apps), `system_files/usr/share/ublue-os/homebrew/` (Brew bundles). User setup via hooks: `privileged-setup.hooks.d/20-dx.sh` for system changes (Docker group). Variants handled with conditional logic (e.g., `[[ "$IMAGE_NAME" == *nvidia* ]]`).

## Repository Structure

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

## Package Management

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

## Configuration Patterns

1. **Shared configs** in `system_files/*/shared/`
2. **DE-specific** in `system_files/*/kinoite/`
3. **Variant-specific** in appropriate subdirectories
4. **Global overrides** in `system_files/overrides/`

## Integration Points

Cross-component communication via setup hooks (system → user). Just commands extend base functionality. Flatpak system apps installed during user setup. Container networking requires `iptable_nat` module loading.

## Key Services

```bash
bazzite-autologin.service      # Deck auto-login
bazzite-hardware-setup.service # Hardware detection
bazzite-flatpak-manager.service # Flatpak management
hhd.service                    # Handheld daemon
wireplumber-workaround.service # Audio fixes
```
