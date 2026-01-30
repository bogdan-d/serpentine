# vim: set ft=make :

# Configure docker,incus-admin,libvirt, container manager, serial permissions
[group('System')]
dx-group:
    #!/usr/bin/pkexec bash
    append_group() {
        local group_name="$1"
        if ! grep -q "^$group_name:" /etc/group; then
            echo "Appending $group_name to /etc/group"
            grep "^$group_name:" /usr/lib/group | sudo tee -a /etc/group > /dev/null
        fi
    }

    GROUPS_ADD=("docker" "incus-admin" "libvirt" "dialout")

    for GROUP_ADD in "${GROUPS_ADD[@]}" ; do
        append_group $GROUP_ADD
        usermod -aG $GROUP_ADD {{ `id -un` }}
    done

    echo "Reboot system and log back in to use docker, libvirt, incus, and serial connections."

# Install fonts from brew
install-fonts:
    #!/usr/bin/bash
    echo "Installing extra fonts..."
    brew bundle --file=/usr/share/ublue-os/homebrew/serpentine-fonts.Brewfile

# Configure CoreCtrl for GPU/CPU overclocking and monitoring
[group('System')]
configure-corectrl ACTION="":
    #!/usr/bin/bash
    source /usr/lib/ujust/ujust.sh
    OPTION="{{ ACTION }}"
    AUTOSTART_DIR="$HOME/.config/autostart"
    AUTOSTART_FILE="$AUTOSTART_DIR/org.corectrl.CoreCtrl.desktop"
    DESKTOP_FILE="/usr/share/applications/org.corectrl.CoreCtrl.desktop"

    # Check if CoreCtrl is installed
    if ! command -v corectrl &> /dev/null; then
        echo -e "${red}${bold}Error:${normal} CoreCtrl is not installed."
        echo "CoreCtrl should be included in the system image."
        exit 1
    fi

    # Check current AMD kernel parameter status
    AMDGPU_KARG_STATUS="Not Set"
    if grep -q "amdgpu.ppfeaturemask=" /proc/cmdline 2>/dev/null; then
        AMDGPU_KARG_STATUS=$(grep -o 'amdgpu.ppfeaturemask=[^ ]*' /proc/cmdline | cut -d= -f2)
    fi

    # Check autostart status
    AUTOSTART_STATUS="Disabled"
    if [[ -f "$AUTOSTART_FILE" ]]; then
        AUTOSTART_STATUS="Enabled"
    fi

    if [ "$OPTION" == "help" ]; then
        echo "Usage: ujust configure-corectrl [command]"
        echo "Commands:"
        echo "  enable-amd     - Enable full AMD GPU control (adds kernel parameter)"
        echo "  disable-amd    - Disable AMD GPU kernel parameter"
        echo "  enable-autostart  - Enable CoreCtrl to start automatically on login"
        echo "  disable-autostart - Disable CoreCtrl autostart"
        echo "  status         - Show current configuration status"
        echo "  help           - Show this help message"
        exit 0
    elif [ "$OPTION" == "status" ]; then
        echo -e "${bold}CoreCtrl Configuration Status:${normal}"
        echo -e "  AMD GPU kernel parameter: ${bold}${AMDGPU_KARG_STATUS}${normal}"
        echo -e "  Autostart on login: ${bold}${AUTOSTART_STATUS}${normal}"
        echo ""
        echo -e "${bold}User groups:${normal} $(groups)"
        echo -e "${bold}Note:${normal} 'render' and 'video' groups are required and should be configured automatically."
        exit 0
    fi

    if [ -z "$OPTION" ]; then
        echo -e "${bold}CoreCtrl Configuration${normal}"
        echo -e "GPU/CPU overclocking and monitoring tool for Linux"
        echo ""
        echo -e "${bold}Current Status:${normal}"
        echo -e "  AMD GPU kernel parameter: ${bold}${AMDGPU_KARG_STATUS}${normal}"
        echo -e "  Autostart on login: ${bold}${AUTOSTART_STATUS}${normal}"
        echo ""
        echo "What would you like to configure?"
        OPTION=$(ugum choose \
            "Enable AMD Full GPU Control" \
            "Disable AMD GPU Parameter" \
            "Enable Autostart" \
            "Disable Autostart" \
            "Launch CoreCtrl Now" \
            "Exit without changes")
    fi

    case "$OPTION" in
        "Enable AMD Full GPU Control"|"enable-amd")
            echo "Enabling full AMD GPU control..."
            echo "This adds: amdgpu.ppfeaturemask=0xffffffff"
            echo "Allows voltage control and advanced overclocking options."
            echo "Requesting system modifications..."
            rpm-ostree kargs --append-if-missing="amdgpu.ppfeaturemask=0xffffffff"
            echo -e "${green}${bold}AMD GPU parameter enabled.${normal} Reboot required to apply."
            ;;
        "Disable AMD GPU Parameter"|"disable-amd")
            echo "Removing AMD GPU kernel parameter..."
            rpm-ostree kargs --delete-if-present="amdgpu.ppfeaturemask=0xffffffff"
            echo -e "${red}${bold}AMD GPU parameter removed.${normal} Reboot required to apply."
            ;;
        "Enable Autostart"|"enable-autostart")
            if [[ -f "$AUTOSTART_FILE" ]]; then
                echo "CoreCtrl autostart is already enabled."
            else
                echo "Enabling CoreCtrl autostart..."
                mkdir -p "$AUTOSTART_DIR"
                cp "$DESKTOP_FILE" "$AUTOSTART_FILE"
                echo -e "${green}${bold}Autostart enabled.${normal} CoreCtrl will start automatically on next login."
            fi
            ;;
        "Disable Autostart"|"disable-autostart")
            if [[ ! -f "$AUTOSTART_FILE" ]]; then
                echo "CoreCtrl autostart is already disabled."
            else
                echo "Disabling CoreCtrl autostart..."
                rm -f "$AUTOSTART_FILE"
                echo -e "${red}${bold}Autostart disabled.${normal} CoreCtrl will no longer start automatically."
            fi
            ;;
        "Launch CoreCtrl Now")
            echo "Launching CoreCtrl..."
            corectrl &
            ;;
        "Exit without changes"|*)
            echo "No changes made."
            ;;
    esac

# Toggle default boot between Steam Game Mode (gamescope-session) and Desktop
toggle-gamemode ACTION="":
    #!/usr/bin/bash
    # Lets the user pick the default SDDM autologin session.
    set -euo pipefail
    source /usr/lib/ujust/ujust.sh 2>/dev/null || true

    ACTION="{{ ACTION }}"

    IMAGE_INFO="/usr/share/ublue-os/image-info.json"
    BASE_IMAGE_NAME=$(jq -r '."base-image-name"' < "$IMAGE_INFO" 2>/dev/null || echo "silverblue")

    # Determine desktop session based on base image (KDE = kinoite, GNOME = silverblue)
    DESKTOP_SESSION="gnome-wayland.desktop"
    if [[ $BASE_IMAGE_NAME == "kinoite" ]]; then
        DESKTOP_SESSION="plasma.desktop"
    fi

    GAMEMODE_SESSION="gamescope-session.desktop"
    CONFIG_FILE="/etc/sddm.conf.d/zz-steamos-autologin.conf"

    current_session="Unknown"
    if [[ -f $CONFIG_FILE ]]; then
        current_session=$(grep -Po '^Session=\K.*' "$CONFIG_FILE" || true)
    fi
    if [[ -z $current_session ]]; then
        # Fallback guess
        current_session="$DESKTOP_SESSION"
    fi

    status_pretty="Unknown"
    if [[ $current_session == "$GAMEMODE_SESSION" ]]; then
        status_pretty="Game Mode"
    elif [[ $current_session == "$DESKTOP_SESSION" ]]; then
        status_pretty="Desktop"
    else
        status_pretty="$current_session"
    fi

    ACTION_LOWER=${ACTION,,}

    if [[ $ACTION_LOWER == "help" ]]; then
        echo "Usage: ujust toggle-gamemode [gamemode|desktop|status|help]"
        echo "If no action is provided you'll be prompted with a picker."
        exit 0
    fi

    if [[ $ACTION_LOWER == "status" ]]; then
        echo -e "Current default session: ${bold}${status_pretty}${normal} (${current_session})"
        exit 0
    fi

    CHOICE=""
    if [[ -z $ACTION_LOWER ]]; then
        echo -e "Current default boot target: ${bold}${status_pretty}${normal}\n"
        echo "Select the default session to boot into:"
        echo ""
        CHOICE=$(ugum choose \
            "Steam Game Mode" \
            "Desktop Session" \
            "Exit without changes")
    else
        case "$ACTION_LOWER" in
            gamemode) CHOICE="Steam Game Mode" ;;
            desktop) CHOICE="Desktop Session" ;;
            *) echo "Unrecognized action: $ACTION" ; exit 1 ;;
        esac
    fi

    case "$CHOICE" in
        "Steam Game Mode")
            target_session="$GAMEMODE_SESSION"
            target_pretty="Game Mode"
            ;;
        "Desktop Session")
            target_session="$DESKTOP_SESSION"
            target_pretty="Desktop"
            ;;
        "Exit without changes"|"")
            echo "No changes made."
            exit 0
            ;;
        *)
            echo "Unknown selection: $CHOICE" >&2
            exit 1
            ;;
    esac

    if [[ $target_session == "$current_session" ]]; then
        echo "Already set to $target_pretty ($target_session). Nothing to do."
        exit 0
    fi

    echo "Updating autologin session to: $target_pretty ($target_session)"
    update_content=$'# Autogenerated by ujust toggle-gamemode\n[Autologin]\nSession='"$target_session"

    if [[ $EUID -ne 0 ]]; then
        echo "Requesting root privileges..."
        echo "$update_content" | sudo tee "$CONFIG_FILE" > /dev/null
    else
        printf '%s\n' "$update_content" > "$CONFIG_FILE"
    fi

    echo -e "${green}${bold}Success:${normal} Default session set to $target_pretty. Reboot or log out to apply."
