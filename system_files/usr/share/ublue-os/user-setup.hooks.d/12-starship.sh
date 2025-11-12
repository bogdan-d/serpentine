#!/usr/bin/bash

source /usr/lib/ublue/setup-services/libsetup.sh

version-script starship user 1 || exit 1

set -x

# Copy starship theme
STARSHIP_THEME_DIR="/etc/skel/.config/starship.toml"
STARSHIP_CONFIG_FILE="${XDG_CONFIG_HOME:-$HOME/.config}/starship.toml"
if [[ ! -f "$STARSHIP_CONFIG_FILE" ]]; then
  cp -fv "$STARSHIP_THEME_DIR" "$STARSHIP_CONFIG_FILE"
fi

set +x
