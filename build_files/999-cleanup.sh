#!/usr/bin/bash
set -euo pipefail

trap '[[ $BASH_COMMAND != echo* ]] && [[ $BASH_COMMAND != log* ]] && echo "+ $BASH_COMMAND"' DEBUG

log() {
    echo "=== $* ==="
}

log "Starting system cleanup"

# Clean package manager cache
dnf5 clean all

# Clean temporary files
rm -rf /tmp/*

# Cleanup the entirety of `/var`.
# None of these get in the end-user system and bootc lints get super mad if anything is in there
# shellcheck disable=SC2114
# Note: We cannot remove /var/cache and /var/log since they are mounted as cache volumes
# in the Containerfile. Instead, we remove their contents and other /var subdirectories.
find /var -mindepth 1 -maxdepth 1 ! -name cache ! -name log -exec rm -rf {} +
find /var/cache -mindepth 1 -maxdepth 1 -exec rm -rf {} +
find /var/log -mindepth 1 -maxdepth 1 -exec rm -rf {} +

# Ensure /var exists
mkdir -p /var

# Commit and lint container
# This step is done in the Containerfile
# bootc container lint || true

log "Cleanup completed"
