# Extension Guidelines

## Adding New Features

1. Place build logic in `build_files/` (prefer existing scripts over new ones).
2. Place filesystem/config overlays in `system_files/`.
3. Enable system services in `build_files/40-services.sh`.
4. For one-time setup, add a hook under `.../privileged-setup.hooks.d/` or `.../user-setup.hooks.d/` with `version-script`.

## Common Touchpoints

- `build_files/20-install-apps.sh` — package installation and repo setup
- `build_files/40-services.sh` — service enablement
- `system_files/etc/skel/` — default user config
- `system_files/usr/lib/systemd/system/` — unit files

## Package Source Policy

- Prefer Fedora/ublue packages first.
- Adding extra repos/COPR is a last resort; keep repos disabled by default and enable only for targeted installs.
