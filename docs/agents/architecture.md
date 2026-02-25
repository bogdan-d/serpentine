# Architecture

## Build Flow

1. `Containerfile` mounts `/run/context` from a scratch stage.
2. `build_files/build.sh` copies `system_files/` and runs numbered scripts in `build_files/`.
3. Script order is authoritative (`00-*`, `20-*`, `40-*`, …).

## Runtime Configuration

- Persistent/system overlays are shipped via `system_files/`.
- First-boot tasks run through `ublue-system-setup.service` hooks:
	- `.../privileged-setup.hooks.d/`
	- `.../user-setup.hooks.d/`

## Build Interface

- Primary entrypoint: `just` recipes from `Justfile`.
- Inspect available recipes with `just --list`.
