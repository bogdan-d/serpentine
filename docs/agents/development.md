# Development Workflows

## Local Testing

Local testing: `podman build -t test .` then `podman run --rm -it test /bin/bash`. Full builds require CI with akmods. Installation: `rpm-ostree rebase ostree-image-signed:docker://ghcr.io/bogdan-d/serpentine:stable`.

## Building Images

```bash
# Build Steam Deck image
just build bazzite-deck kinoite

# Build NVIDIA variant
just build bazzite-deck-nvidia kinoite
```

## Testing Changes

```bash
# Validate Just syntax
just just-check

# Run container for testing
just run bazzite-deck kinoite

# Build and test ISO
just build-iso bazzite-deck kinoite && just run-iso bazzite-deck kinoite
```

## Debugging

- `journalctl -u service-name` - View service logs
- `systemctl --global status service-name` - Check user services
- `just just-check` - Validate syntax (expected to show warnings about unknown attributes)

## Build/Test Commands

**Primary build tool**: `just` (command runner)
- `just --list` - List all available commands
- `just just-check` - Validate Just syntax across all files (ALWAYS run before submitting)
- `just build <target>` - Build container images (CI only - requires akmods kernel images)
- `just build-iso <target>` - Build ISO images (CI only)
- `just list-images` - Show local container images
- `just clean-images` - Cleanup local images

## Critical Constraints

- Branch names cannot contain "/" characters (breaks Docker tags)
- CI builds take 60+ minutes - NEVER cancel validation workflows
- Local builds fail without specialized akmods kernel images
- Full builds require CI environment with specialized akmods kernel images
- Focus development on configuration files, scripts, and system files
- Most development can be done locally without full container builds
