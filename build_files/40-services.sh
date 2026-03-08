#!/usr/bin/env bash
set -xeuo pipefail

# Enable DX services
if rpm -q docker-ce >/dev/null; then
    systemctl enable docker.socket
fi
systemctl enable podman.socket
systemctl enable swtpm-workaround.service
systemctl enable ublue-system-setup.service
systemctl --global enable ublue-user-setup.service
systemctl enable ublue-os-libvirt-workarounds.service
systemctl enable serpentine-dx-groups.service
