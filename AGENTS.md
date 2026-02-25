# Serpentine Development Guidelines

Serpentine is a Bazzite-based immutable image. Prefer script/config changes over assumptions.

## Mandatory Checks

- `just check` — validate Justfile syntax.
- `just lint` — run shellcheck across shell scripts.

## Core Workflow Rules

- Make build-time changes in `build_files/` (numeric order matters).
- Put filesystem overlays in `system_files/`.
- For one-time boot tasks, use hooks in:
	- `system_files/usr/share/ublue-os/privileged-setup.hooks.d/`
	- `system_files/usr/share/ublue-os/user-setup.hooks.d/`
- Gate one-time hooks with `version-script <name> <scope> <version>`.

## Constraints

- Branch names must not contain `/` (Docker tag compatibility).
- CI builds are long-running; do not cancel validation workflows.
- Full local VM/ISO builds may fail without akmods-capable environment.

## Package Management

- **DNF5** for system RPMs.
- **Flatpak** for user apps.
- **Homebrew** for additional CLI/tools/fonts.

## Docs

- [Architecture](docs/agents/architecture.md)
- [Configuration](docs/agents/configuration.md)
- [Code Style](docs/agents/code-style.md)
- [Development](docs/agents/development.md)
- [Packages](docs/agents/packages.md)
- [Extension](docs/agents/extension.md)

IMPORTANT: Prefer retrieval-led reasoning over pre-training-led reasoning for Fedora/Kinoite/Bazzite tasks.