#!/usr/bin/env bash
set -xeuo pipefail

# Enable DX services
if rpm -q docker-ce >/dev/null; then
    systemctl enable docker.socket
fi
systemctl enable podman.socket
systemctl enable ublue-system-setup.service
systemctl --global enable ublue-user-setup.service
systemctl enable ublue-os-libvirt-workarounds.service
systemctl enable serpentine-dx-groups.service

# Restore UUPD update timer and Input Remapper
sed -i 's@^NoDisplay=true@NoDisplay=false@' /usr/share/applications/input-remapper-gtk.desktop
systemctl enable input-remapper.service
systemctl enable uupd.timer

# Restore tuned
systemctl mask powerstation.service
systemctl enable tuned.service
systemctl enable tuned-ppd.service

#################################################
### Current contents of /etc/sysconfig/firewalld
#################################################
#      │ File: /etc/sysconfig/firewalld
# ─────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
#    1 │ # firewalld command line args
#    2 │ # possible values: --debug
#    3 │ FIREWALLD_ARGS=

# Force firewalld to log everything to systemd-journald (via syslog target)
# and stop writing endlessly to /var/log/firewalld
echo "Configuring firewalld logging..."
mkdir -p /etc/sysconfig
touch /etc/sysconfig/firewalld
# Remove the argument if it already exists in the base image, then append our override
sed -i '/^FIREWALLD_ARGS=/d' /etc/sysconfig/firewalld
echo 'FIREWALLD_ARGS="--log-target=syslog"' >> /etc/sysconfig/firewalld
