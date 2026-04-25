#!/usr/bin/env bash

set -euo pipefail

source /usr/lib/ublue/setup-services/libsetup.sh

version-script docker-nocow privileged 2 || exit 0

DOCKER_DATA_ROOT="/var/lib/docker"

if ! command -v chattr >/dev/null || ! command -v lsattr >/dev/null; then
    echo "Skipping Docker No_COW setup: chattr/lsattr not available."
    exit 0
fi

mkdir -p "${DOCKER_DATA_ROOT}"

if [[ "$(stat -f -c %T "${DOCKER_DATA_ROOT}")" != "btrfs" ]]; then
    echo "Skipping Docker No_COW setup: ${DOCKER_DATA_ROOT} is not on btrfs."
    exit 0
fi

if lsattr -d "${DOCKER_DATA_ROOT}" | grep -q 'C'; then
    echo "Docker No_COW already enabled on ${DOCKER_DATA_ROOT}."
    exit 0
fi

if [[ -n "$(find "${DOCKER_DATA_ROOT}" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null || true)" ]]; then
    echo "Warning: ${DOCKER_DATA_ROOT} already contains data."
    echo "No_COW will apply to new files; existing files keep their current attributes."
fi

chattr -R +C "${DOCKER_DATA_ROOT}"

if lsattr -d "${DOCKER_DATA_ROOT}" | grep -q 'C'; then
    echo "Docker No_COW enabled on ${DOCKER_DATA_ROOT}."
else
    echo "Failed to enable Docker No_COW on ${DOCKER_DATA_ROOT}." >&2
    exit 1
fi
