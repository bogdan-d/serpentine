# Packages

## Managers by Scope

- **DNF5**: system RPMs
- **Flatpak**: user applications
- **Homebrew**: extra CLI/tools/fonts

## Package Change Rules

- Prefer upstream Fedora or ublue sources before adding new third-party repos.
- Keep package install/remove arrays in `build_files/20-install-apps.sh` organized and readable.
- Keep optional repos disabled by default; enable only for the install command that needs them.
