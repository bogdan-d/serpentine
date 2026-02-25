# Development Workflows

## Core Commands

- `just --list` — list available recipes
- `just check` — validate Just syntax
- `just lint` — run shellcheck over `*.sh`
- `just build` — build the container image
- `just build-iso` / `just build-qcow2` — produce VM artifacts

## Debugging

- `journalctl -u service-name` - View service logs
- `systemctl --global status service-name` - Check user services

## Critical Constraints

- Branch names cannot contain "/" characters (breaks Docker tags)
- CI builds are long-running; do not cancel validation workflows
- Full local VM/ISO builds may fail without akmods-capable environment
