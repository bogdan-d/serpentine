# vim: set ft=make :

# runs ryzenadj --max-performance on AC power change
enable-ryzenadj-max-performance:
    #/bin/bash
    # credit to adolforegosa on discord for the original fix and Katman for the script corrections
    echo 'this fix sets ryzenadj --max-performance whenever AC status changes to battery from plugged-in'
    echo 'ACTION=="change", SUBSYSTEM=="power_supply", ATTR{online}=="0", RUN+="/usr/bin/ryzenadj --max-performance"' | sudo tee "/etc/udev/rules.d/99-ryzenadj-power-source-change.rules" > /dev/null

    sudo udevadm control --reload-rules
    sudo tee /etc/systemd/system/max-perf-boot.service > /dev/null <<'EOF'
    [Unit]
    Description=Apply RyzenAdj max performance at boot

    [Service]
    Type=oneshot
    ExecStart=/usr/bin/ryzenadj --max-performance

    [Install]
    WantedBy=multi-user.target
    EOF
    sudo systemctl daemon-reload
    sudo systemctl enable max-perf-boot.service
    echo 'Installation complete. Reboot to take effect'

# disables ryzenadj --max-performance on AC power
disable-ryzenadj-max-performance:
    #/bin/bash
    sudo rm /etc/udev/rules.d/99-ryzenadj-power-source-change.rules
    sudo udevadm control --reload-rules
    sudo systemctl stop max-perf-boot.service
    sudo systemctl disable --now max-perf-boot.service
    sudo rm /etc/systemd/system/max-perf-boot.service
    sudo systemctl daemon-reload
    echo 'removal complete, reboot to take effect.'

# Manage input remapper feature on non-desktop images. Options: status | enable | disable
restore-input-remapper ACTION="":
    #!/usr/bin/bash
    source /usr/lib/ujust/ujust.sh
    DESKTOP_FILE="$HOME/.local/share/applications/input-remapper-gtk.desktop"
    get_status_token() {
        if systemctl is-enabled --quiet input-remapper.service && [[ -f "$DESKTOP_FILE" ]]; then
            echo "enable"
        else
            echo "disable"
        fi
    }
    get_current_status() {
        if [[ "$(get_status_token)" == "enable" ]]; then
            echo "Enabled"
        else
            echo "Disabled"
        fi
    }
    enable_input_remapper() {
        systemctl enable --now input-remapper.service
        mkdir -p "$HOME/.local/share/applications"
        cp /usr/share/applications/input-remapper-gtk.desktop "$DESKTOP_FILE"
        sed -i '/NoDisplay=true/d' "$DESKTOP_FILE"
        echo "Input Remapper has been enabled."
    }
    disable_input_remapper() {
        systemctl disable --now input-remapper.service
        rm -f "$DESKTOP_FILE"
        echo "Input Remapper has been disabled."
    }
    OPTION="{{ ACTION }}"
    if [[ "$OPTION" == "help" ]]; then
        echo "Usage: ujust restore-input-remapper <option>"
        echo "  <option>: Specify the quick option to skip the prompt"
        echo "  Use 'status' to print the current portal token"
        echo "  Use 'enable' to enable Input Remapper"
        echo "  Use 'disable' to disable Input Remapper"
        exit 0
    elif [[ "$OPTION" == "status" ]]; then
        get_status_token
        exit 0
    elif [[ "$OPTION" == "enable" ]]; then
        enable_input_remapper
        exit 0
    elif [[ "$OPTION" == "disable" ]]; then
        disable_input_remapper
        exit 0
    elif [[ -z "$OPTION" ]]; then
        current_status=$(get_current_status)
        echo "${bold}Input Remapper${normal}"
        echo "Current status: $current_status"
        OPTION=$(ugum choose "Enable" "Disable" "Exit without changes")
        case "$OPTION" in
            "Enable")
                enable_input_remapper
                ;;
            "Disable")
                disable_input_remapper
                ;;
            *)
                echo "No changes made."
                ;;
        esac
        exit 0
    fi

# Install firmware files needed for ayaneo and orangepi speakers
install-speaker-firmware ACTION="":
    #!/bin/bash
    source /usr/lib/ujust/ujust.sh
    OPTION={{ ACTION }}
    FIRMWARE_SCRIPT="https://raw.githubusercontent.com/bazzite-org/hwinfo/refs/heads/master/firmware/bazzite-speaker.sh"
    curl -o "/tmp/bazzite-speaker.sh" "$FIRMWARE_SCRIPT" && cat /tmp/bazzite-speaker.sh | pygmentize -l bash -O style=emacs
    echo ""
    echo "Run the above script using elevated permissions?"
    if [ "$OPTION" == "" ]; then
      OPTION=$(Choose "Yes" "No")
    fi
    if [[ "${OPTION,,}" =~ ^yes || "${OPTION,,}" =~ ^-y ]]; then
      sudo bash /tmp/bazzite-speaker.sh
    fi
    rm /tmp/bazzite-speaker.sh

# Configure video overrides for Steam
configure-override-videos ACTION="":
    #!/usr/bin/bash
    source /usr/lib/ujust/ujust.sh
    OPTION={{ ACTION }}
    NO_VIDEO="$HOME/.local/share/Steam/config/uioverrides/movies/bazzite_novideo"
    if [ ! -f $NO_VIDEO ]; then
        VIDEO_STATE="${b}Enabled${n}"
    else
        VIDEO_STATE="${b}Disabled${n}"
    fi
    if [ "$OPTION" == "help" ]; then
      echo "Usage: ujust configure-override-videos <option>"
      echo "  <option>: Specify the quick option to skip the prompt"
      echo "  Use 'enable' to enable override videos."
      echo "  Use 'disable' to disable and remove override videos."
      exit 0
    elif [ "$OPTION" == "" ]; then
      echo "${bold}Override video configuration${normal}"
      echo "Videos are: $VIDEO_STATE"
      OPTION=$(Choose "Enable Videos" "Disable Videos")
    fi
    if [[ "${OPTION,,}" =~ ^enable ]]; then
      echo "Removing $NO_VIDEO"
      rm -f $NO_VIDEO
    elif [[ "${OPTION,,}" =~ ^disable ]]; then
      echo "Adding $NO_VIDEO"
      touch $NO_VIDEO
      rm -f $HOME/.local/share/Steam/config/uioverrides/movies/bigpicture_startup.webm
      rm -f $HOME/.local/share/Steam/config/uioverrides/movies/steam_os_startup.webm
      rm -f $HOME/.local/share/Steam/config/uioverrides/movies/steam_os_suspend.webm
      rm -f $HOME/.local/share/Steam/config/uioverrides/movies/steam_os_suspend_from_throbber.webm
      rm -f $HOME/.local/share/Steam/config/uioverrides/movies/deck_startup.webm
      rm -f $HOME/.local/share/Steam/config/uioverrides/movies/deck-suspend-animation.webm
      rm -f $HOME/.local/share/Steam/config/uioverrides/movies/deck-suspend-animation-from-throbber.webm
      rm -f $HOME/.local/share/Steam/config/uioverrides/movies/oled_startup.webm
      rm -f $HOME/.local/share/Steam/config/uioverrides/movies/oled-suspend-animation.webm
      rm -f $HOME/.local/share/Steam/config/uioverrides/movies/oled-suspend-animation-from-throbber.webm
    fi

# Restores the stock virtual keyboard under KDE & GNOME
restore-virtual-keyboard:
    #!/usr/bin/bash
    IMAGE_INFO="/usr/share/ublue-os/image-info.json"
    BASE_IMAGE_NAME=$(jq -r '."base-image-name"' < $IMAGE_INFO)
    if [[ ${BASE_IMAGE_NAME} == 'silverblue' ]]; then
      gnome-extensions disable block-caribou-36@lxylxy123456.ercli.dev
    else
      if [[ ! -f ~/.local/share/applications/com.github.maliit.keyboard.desktop ]]; then
        mkdir -p ~/.local/share/applications/
        cp /usr/share/ublue-os/backup/com.github.maliit.keyboard.desktop ~/.local/share/applications/com.github.maliit.keyboard.desktop
      fi
    fi

# Restore the "Return to Gaming Mode" shortcut on the Desktop
restore-gamemode-shortcut:
    #!/usr/bin/bash
    # Define paths
    SHORTCUT_FILE="$HOME/Desktop/Return.desktop"
    SKEL_FILE="/etc/skel/Desktop/Return.desktop"
    # Check if the shortcut already exists
    if [ -f "$SHORTCUT_FILE" ]; then
      echo "The shortcut 'Return to Gaming Mode' already exists at $SHORTCUT_FILE."
      echo "No changes were made."
      exit 0
    fi
    # Check if the original file exists in skel
    if [ ! -f "$SKEL_FILE" ]; then
      echo "Error: The original file does not exist at $SKEL_FILE."
      echo "Unable to restore the shortcut."
      exit 1
    fi
    # Copy the file from skel to the desktop
    echo "Restoring the 'Return to Gaming Mode' shortcut from $SKEL_FILE..."
    mkdir -p "$HOME/Desktop"  # Ensure the Desktop directory exists
    cp "$SKEL_FILE" "$SHORTCUT_FILE"
    # Ensure the file is executable
    chmod +x "$SHORTCUT_FILE"
    echo "Shortcut restored successfully at $SHORTCUT_FILE."
    echo "Note: The first time you use the shortcut, it may ask you to trust it. Please accept."
