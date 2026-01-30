# Code Style Guidelines

## Formatting

- Line length: Maximum 120 characters
- No trailing whitespace
- Files must end with newline character
- Blank lines required between different list groups
- Blank line required after section headers

## Branch Naming (CRITICAL)

**No "/" characters** - breaks Docker tags:
- `feat-<description>` - New features
- `fix-<issue-number>` - Bug fixes
- `docs-<description>` - Documentation updates
- `refactor-<component>` - Code refactoring

## Naming Conventions

- Use kebab-case for branch names and file names
- Follow existing patterns for variable names in scripts
- Maintain consistency with RPM package naming conventions

## File Organization

- `Justfile` - Main build automation
- `system_files/` - System configuration by variant (deck/nvidia)
- `just_scripts/` - Build helper scripts
- `spec_files/` - RPM spec files for custom packages

## Script Conventions

- Use `set -euo pipefail` in shell scripts
- Numeric script prefixes ensure execution order (e.g., `20-` before `40-`)
- GitHub Actions `::group::` for logging
- Just commands imported via `import "/usr/share/ublue-os/just/95-serpentine.just"`
- Setup hooks use version control (`version-script name scope version`)

## Error Handling

- Use existing error handling patterns in shell scripts
- Follow Just error handling conventions
- Maintain consistency with CI/CD workflow error patterns
