#!/usr/bin/env bash

source /usr/lib/ublue/setup-services/libsetup.sh

version-script dx-usergroups privileged 1 || exit 0

# Function to append a group entry to /etc/group
append_group() {
    local group_name="$1"
    if ! grep -q "^$group_name:" /etc/group; then
        echo "Appending $group_name to /etc/group"
        grep "^$group_name:" /usr/lib/group | tee -a /etc/group >/dev/null
    fi
}

# Setup Groups
append_group docker

# We don't have incus on the image yet
# append_group incus-admin

# TODO: remove serpentine-dx-groups in favor of this file

mapfile -t wheelarray < <(getent group wheel | cut -d ":" -f 4 | tr ',' '\n')
for user in "${wheelarray[@]}"; do
    usermod -aG docker "$user"
    # usermod -aG incus-admin $user
    # For working with the GPU
    usermod -aG render "$user"
    usermod -aG video "$user"
done
