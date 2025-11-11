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
# shellcheck source=scripts/copr-helpers.sh
source /run/context/build_files/scripts/copr-helpers.sh

# Apply IP Forwarding before installing Docker to prevent messing with LXC networking
sysctl -p

# Load iptable_nat module for docker-in-docker.
# See:
#   - https://github.com/ublue-os/bluefin/issues/2365
#   - https://github.com/devcontainers/features/issues/1235
mkdir -p /etc/modules-load.d
tee /etc/modules-load.d/ip_tables.conf <<EOF
iptable_nat
EOF

# Packages installed as a group. Keep this list alphabetized where practical
# to make diffs smaller when adding/removing packages.
FEDORA_PACKAGES=(
    android-tools
    bcc
    bpftop
    bpftrace
    ccache
    cockpit-bridge
    cockpit-machines
    cockpit-networkmanager
    cockpit-ostree
    cockpit-podman
    cockpit-selinux
    cockpit-storaged
    cockpit-system
    dbus-x11
    edk2-ovmf
    flatpak-builder
    # incus
    # incus-agent
    iotop
    libvirt
    libvirt-nss
    # lxc
    nicstat
    numactl
    osbuild-selinux
    p7zip
    p7zip-plugins
    podman-compose
    podman-machine
    podman-tui
    # python3-ramalama
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
    restic
    rclone
    rocm-hip
    rocm-opencl
    rocm-smi
    sysprof
    tiptop
    trace-cmd
    udica
    usbmuxd
    virt-manager
    virt-v2v
    virt-viewer
    ydotool
)

# Install the package group in one go
echo "Installing ${#FEDORA_PACKAGES[@]} DX packages from Fedora repos..."
dnf5 install -y "${FEDORA_PACKAGES[@]}"

# Docker packages from their repo
echo "Installing Docker from official repo..."
dnf5 config-manager addrepo --from-repofile=https://download.docker.com/linux/fedora/docker-ce.repo
dnf5 config-manager setopt docker-ce-stable.enabled=0
dnf5 -y install --enablerepo=docker-ce-stable \
    containerd.io \
    docker-buildx-plugin \
    docker-ce \
    docker-ce-cli \
    docker-compose-plugin \
    docker-model-plugin

# Install COPR packages with isolated repo enablement
echo "Installing DX COPR packages with isolated repo enablement..."
copr_install_isolated "karmab/kcli" "kcli"
copr_install_isolated "gmaglione/podman-bootc" "podman-bootc"
# This service sets up various ublue-os features at boot
# Such as running scripts from system_files/usr/share/ublue-os/privileged-setup.hooks.d
# and system_files/usr/share/ublue-os/user-setup.hooks.d
copr_install_isolated "ublue-os/packages" "ublue-setup-services" "ublue-os-libvirt-workarounds"

# # Load iptable_nat module for docker-in-docker.
# # See:
# #   - https://github.com/ublue-os/bluefin/issues/2365
# #   - https://github.com/devcontainers/features/issues/1235
# mkdir -p /etc/modules-load.d && cat >>/etc/modules-load.d/ip_tables.conf <<EOF
# iptable_nat
# EOF
