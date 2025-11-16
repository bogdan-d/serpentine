#!/usr/bin/env bash
set -xeuo pipefail

# Restore UUPD update timer and Input Remapper
# sed -i 's@^NoDisplay=true@NoDisplay=false@' /usr/share/applications/input-remapper-gtk.desktop
# systemctl enable input-remapper.service
# systemctl enable uupd.timer

# Remove -deck specific changes to allow for login screens
rm -fv /etc/sddm.conf.d/steamos.conf
rm -fv /etc/sddm.conf.d/virtualkbd.conf
rm -fv /usr/share/gamescope-session-plus/bootstrap_steam.tar.gz
systemctl disable bazzite-autologin.service
dnf5 remove -y steamos-manager

if [[ "$IMAGE_NAME" == *gnome* ]]; then
    # Remove SDDM and re-enable GDM on GNOME builds.
    dnf5 remove -y \
        sddm

    systemctl enable gdm.service
else
    # Re-enable logout and switch user functionality in KDE
    sed -i -E \
      -e 's/^(action\/switch_user)=false/\1=true/' \
      -e 's/^(action\/start_new_session)=false/\1=true/' \
      -e 's/^(action\/lock_screen)=false/\1=true/' \
      -e 's/^(kcm_sddm\.desktop)=false/\1=true/' \
      -e 's/^(kcm_plymouth\.desktop)=false/\1=true/' \
      /etc/xdg/kdeglobals
fi

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
