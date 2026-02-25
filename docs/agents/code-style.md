# Code Style Guidelines

## Script Conventions

- Use `set -euo pipefail` in shell scripts
- Keep build script filenames numerically ordered (`20-*` before `40-*`)
- Keep package arrays alphabetized where practical
- Setup hooks should use `version-script name scope version`

## Validation

- Run `just check` after touching `.just` files
- Run `just lint` after touching shell scripts

## Branch Naming

- Branch names must not contain `/` (Docker tag compatibility)
