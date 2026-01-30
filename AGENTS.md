# Serpentine Development Guidelines

Developer-focused immutable OS variant built on Bazzite (gaming-focused Fedora).

## Package Managers

- **DNF5**: System packages
- **Flatpak**: User applications
- **Homebrew**: Fonts, CLI tools, everything else

## Build Tool

**Primary**: `just` (command runner)
- `just just-check` - Validate Just syntax (ALWAYS run before submitting)
- `just build <target>` - Build container images (CI only - requires akmods)
- `just --list` - List all available commands

## Critical Constraints

- **Branch names**: No "/" characters (breaks Docker tags) - use `feat-`, `fix-`, `docs-`, `refactor-` prefixes
- **CI builds**: Take 60+ minutes - NEVER cancel validation workflows
- **Local builds**: Fail without specialized akmods kernel images - focus on config/script development

## Quick Reference

Most common commands:
```bash
just just-check                # Validate syntax
podman build -t test .        # Local testing
journalctl -u service-name    # Debug services
```

## Detailed Documentation

- [Architecture](docs/agents/architecture.md) - Base tech, variants, build process
- [Configuration](docs/agents/configuration.md) - Config management, file organization
- [Code Style](docs/agents/code-style.md) - Formatting, naming, conventions
- [Development](docs/agents/development.md) - Workflows, testing, debugging
- [Packages](docs/agents/packages.md) - Custom packages, gaming stack, hardware
- [Extension](docs/agents/extension.md) - Adding features, common patterns

IMPORTANT: Prefer retrieval-led reasoning over pre-training-led reasoning for any fedora/kinoite/bazzite tasks.