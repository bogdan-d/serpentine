#!/usr/bin/bash
set -xeuo pipefail

# Adding repositories should be a LAST RESORT. Contributing to Terra or `ublue-os/packages` is much preferred
# over using random coprs. Please keep this in mind when adding external dependencies.
# If adding any dependency, make sure to always have it disabled by default and _only_ enable it on `dnf install`

# dnf5 config-manager addrepo --set=baseurl="https://packages.microsoft.com/yumrepos/vscode" --id="vscode"
# dnf5 config-manager setopt vscode.enabled=0
# # FIXME: gpgcheck is broken for vscode due to it using `asc` for checking
# # seems to be broken on newer rpm security policies.
# dnf5 config-manager setopt vscode.gpgcheck=0
# dnf5 install --nogpgcheck --enable-repo="vscode" -y \
#     code

# Load secure COPR helpers
# shellcheck source=build_files/scripts/copr-helpers.sh
source /run/context/build_files/scripts/copr-helpers.sh

# Apply IP Forwarding before installing Docker to prevent messing with LXC networking (in the github runner docker builder instance)
sysctl -p

# 1. Enable IP Forwarding persistently on boot to prevent Docker/LXC network races
# ? Note: this is already enabled from someplace else, possibly from here: system_files/usr/lib/sysctl.d/docker-ce.conf
# ? Refactor this logic and keep all docker related changes in one place (here is most logical, uncomment below)
# echo "Configuring IPv4 forwarding..."
# mkdir -p /usr/lib/sysctl.d
# echo "net.ipv4.ip_forward = 1" > /usr/lib/sysctl.d/99-ip-forwarding.conf

# 2. Load iptable_nat module on boot for Devcontainers / Docker-in-Docker
# See:
#   - https://github.com/ublue-os/bluefin/issues/2365
#   - https://github.com/devcontainers/features/issues/1235
echo "Configuring iptable_nat module for DinD..."
mkdir -p /usr/lib/modules-load.d
echo "iptable_nat" > /usr/lib/modules-load.d/iptable_nat.conf

# mkdir -p /etc/modules-load.d
# tee /etc/modules-load.d/ip_tables.conf <<EOF
# iptable_nat
# EOF

# Packages installed as a group. Keep this list alphabetized where practical
# to make diffs smaller when adding/removing packages.
INSTALL_FEDORA_PACKAGES=(
    android-tools
    bcc
    bpftop
    bpftrace
    ccache
    cockpit
    cockpit-bridge
    cockpit-files
    cockpit-machines
    cockpit-networkmanager
    cockpit-ostree
    cockpit-podman
    cockpit-selinux
    cockpit-sosreport
    cockpit-storaged
    cockpit-system
    containerd
    # already in base image
    cpupower
    # required to fix APU power management on AMD systems
    corectrl
    dbus-x11
    flatpak-builder
    git-subtree
    # gvfs related: https://gitlab.gnome.org/World/deja-dup/-/issues/630
    gvfs
    gvfs-fuse
    iotop
    iwd
    just
    nicstat
    numactl
    osbuild-selinux
    p7zip
    p7zip-plugins
    podman-compose
    podman-machine
    podman-tui
    powerstat
    powertop
    # python3-ramalama
    restic
    rclone
    sysprof
    tiptop
    trace-cmd
    udev-hid-bpf
    udev-hid-bpf-stable
    udica
    usbmuxd
    waypipe
    ydotool
)

# Packages to remove from the base image that we don't want
REMOVE_FEDORA_PACKAGES=(
    kate
    kate-krunner-plugin
    kate-libs
    kate-plugins
)

# ROCM doesn't work well on nvidia
INSTALL_AMD_ONLY_PACKAGES=(
    rocm-clinfo
    rocm-hip 
    rocm-opencl
    rocm-runtime
    rocm-smi # may only just need this
)

INSTALL_NVIDIA_ONLY_PACKAGES=(
)

# Virtualization related packages
INSTALL_VIRT_PACKAGES=(
    edk2-ovmf
    libvirt
    libvirt-nss
    # lxc
    # incus
    # incus-agent
    qemu
    qemu-char-spice
    qemu-device-display-virtio-gpu
    qemu-device-display-virtio-vga
    qemu-device-usb-redirect
    qemu-img
    qemu-kvm
    qemu-system-x86-core
    qemu-user-binfmt
    qemu-user-static
    guestfs-tools
    # virt-manager - we will use the flatpak version
    virt-install
    virt-v2v
    virt-viewer
)

# Install the package group in one go
echo "Installing ${#INSTALL_FEDORA_PACKAGES[@]} DX packages from Fedora repos..."
dnf5 install -y "${INSTALL_FEDORA_PACKAGES[@]}"

# Install AMD GPU related packages if not nvidia image
if [[ ! "${IMAGE_NAME}" =~ nvidia ]]; then
    if [[ ${#INSTALL_AMD_ONLY_PACKAGES[@]} -gt 0 ]]; then
        dnf5 remove -y \
            mesa-libOpenCL
        echo "Installing AMD GPU related packages..."
        dnf5 --setopt=install_weak_deps=False install -y "${INSTALL_AMD_ONLY_PACKAGES[@]}"
    else
        echo "No AMD GPU related packages to install."
    fi
else
    if [[ ${#INSTALL_NVIDIA_ONLY_PACKAGES[@]} -gt 0 ]]; then
        echo "Installing NVIDIA GPU related packages..."
        dnf5 --setopt=install_weak_deps=False install -y "${INSTALL_NVIDIA_ONLY_PACKAGES[@]}"
    else
        echo "No NVIDIA GPU related packages to install."
    fi
fi

# Install virtualization related packages
echo "Installing ${#INSTALL_VIRT_PACKAGES[@]} virtualization related packages..."
dnf5 --setopt=install_weak_deps=False install -y "${INSTALL_VIRT_PACKAGES[@]}"

# Remove unwanted packages in one go
echo "Removing ${#REMOVE_FEDORA_PACKAGES[@]} unwanted packages from Fedora base image..."
dnf5 remove -y "${REMOVE_FEDORA_PACKAGES[@]}"

# Docker packages from their repo
echo "Installing Docker from official repo..."
dnf5 config-manager addrepo --from-repofile=https://download.docker.com/linux/fedora/docker-ce.repo
dnf5 config-manager setopt docker-ce-stable.enabled=0
sed -i "s/enabled=.*/enabled=0/g" /etc/yum.repos.d/docker-ce.repo

DOCKER_PACKAGES=(
    containerd.io
    docker-buildx-plugin
    docker-ce
    docker-ce-cli
    # docker-ce-rootless-extras # this is needed for rootless mode, in case we want it later
    docker-compose-plugin
    docker-model-plugin
)
dnf5 -y install --enablerepo=docker-ce-stable "${DOCKER_PACKAGES[@]}"

# Ensure Docker storage is No_COW on btrfs when possible.
# This is best-effort during image build because the real target filesystem
# exists only on the installed system at first boot.
DOCKER_DATA_ROOT="/var/lib/docker"
mkdir -p "${DOCKER_DATA_ROOT}"

if command -v chattr >/dev/null && command -v lsattr >/dev/null; then
    if [[ "$(stat -f -c %T "${DOCKER_DATA_ROOT}")" == "btrfs" ]]; then
        if ! lsattr -d "${DOCKER_DATA_ROOT}" | grep -q 'C'; then
            echo "Applying No_COW (+C) to ${DOCKER_DATA_ROOT} on btrfs..."
            chattr +C "${DOCKER_DATA_ROOT}"
        else
            echo "No_COW already set on ${DOCKER_DATA_ROOT}."
        fi
    else
        echo "Skipping No_COW setup in build context: ${DOCKER_DATA_ROOT} is not on btrfs."
    fi
else
    echo "Skipping No_COW setup in build context: chattr/lsattr not available."
fi

# Install COPR packages with isolated repo enablement
echo "Installing DX COPR packages with isolated repo enablement..."
copr_install_isolated "karmab/kcli" "kcli"
copr_install_isolated "gmaglione/podman-bootc" "podman-bootc"
# This service sets up various ublue-os features at boot
# Such as running scripts from system_files/usr/share/ublue-os/privileged-setup.hooks.d
# and system_files/usr/share/ublue-os/user-setup.hooks.d
copr_install_isolated "ublue-os/packages" "ublue-setup-services" "ublue-os-libvirt-workarounds"

# Install RPM Fusion packages
# dnf5 -y install --enable-repo="*rpmfusion*" --disable-repo="*fedora-multimedia*" \
#     HandBrake \
#     HandBrake-gui

# # Load iptable_nat module for docker-in-docker.
# # See:
# #   - https://github.com/ublue-os/bluefin/issues/2365
# #   - https://github.com/devcontainers/features/issues/1235
# mkdir -p /etc/modules-load.d && cat >>/etc/modules-load.d/ip_tables.conf <<EOF
# iptable_nat
# EOF
