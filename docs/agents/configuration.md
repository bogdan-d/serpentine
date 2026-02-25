# Configuration Management

## Authoritative Locations

- `build_files/` — image build logic (packages, service enablement, cleanup).
- `system_files/` — filesystem overlay copied into the final image.
- `disk_config/` — bootc image-builder disk/ISO definitions.

## Setup Hook Conventions

- Privileged first-boot hooks:
	`system_files/usr/share/ublue-os/privileged-setup.hooks.d/`
- User first-login hooks:
	`system_files/usr/share/ublue-os/user-setup.hooks.d/`
- Hooks must use `version-script` so they run once per version.

## Variant Handling

- Use conditional logic in scripts (for example `IMAGE_NAME` matching `nvidia`) instead of duplicated files.
