#!/usr/bin/env bash

# set -ouex pipefail
set -euo pipefail

### Install packages

# Packages can be installed from any enabled yum repo on the image.
# RPMfusion repos are available by default in ublue main images
# List of rpmfusion packages can be found here:
# https://mirrors.rpmfusion.org/mirrorlist?path=free/fedora/updates/39/x86_64/repoview/index.html&protocol=https&redirect=1

# this installs a package from fedora repos
# dnf5 install -y tmux

# Use a COPR Example:
#
# dnf5 -y copr enable ublue-os/staging
# dnf5 -y install package
# Disable COPRs so they don't end up enabled on the final image:
# dnf5 -y copr disable ublue-os/staging

#### Example for enabling a System Unit File
# systemctl enable podman.socket

CONTEXT_PATH="$(realpath "$(dirname "$0")/..")" # should return /run/context
BUILD_SCRIPTS_PATH="$(realpath "$(dirname $0)")"
MAJOR_VERSION_NUMBER="$(sh -c '. /usr/lib/os-release ; echo $VERSION_ID')"
SCRIPTS_PATH="$(realpath "$(dirname "$0")/scripts")"
export CONTEXT_PATH
export SCRIPTS_PATH
export MAJOR_VERSION_NUMBER

run_buildscripts_for() {
    WHAT=$1
    shift
    # Complex "find" expression here since there might not be any overrides
    # Allows us to numerically sort scripts by stuff like "01-packages.sh" or whatever
    # CUSTOM_NAME is required if we dont need or want the automatic name
    find "${BUILD_SCRIPTS_PATH}/$WHAT" -maxdepth 1 -iname "*-*.sh" -type f -print0 | sort --zero-terminated --sort=human-numeric | while IFS= read -r -d $'\0' script; do
        if [ "${CUSTOM_NAME}" != "" ]; then
            WHAT=$CUSTOM_NAME
        fi
        printf "::group:: ===$WHAT-%s===\n" "$(basename "$script")"
        "$(realpath $script)"
        printf "::endgroup::\n"
    done
}

copy_systemfiles_for() {
    WHAT=$1
    shift
    DISPLAY_NAME=$WHAT
    if [ "${CUSTOM_NAME}" != "" ]; then
        DISPLAY_NAME=$CUSTOM_NAME
    fi
    printf "::group:: ===%s-file-copying===\n" "${DISPLAY_NAME}"
    cp -avf "${CONTEXT_PATH}/$WHAT/." /
    printf "::endgroup::\n"
}

CUSTOM_NAME="base"
copy_systemfiles_for files
run_buildscripts_for .
CUSTOM_NAME=""
