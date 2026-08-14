# vim: set ft=make :

alias upgrade := update

# Update system, flatpaks, and containers all at once
[group("system")]
update:
    #!/usr/bin/bash
    if command -v bazzite-updater >/dev/null 2>&1; then
      bazzite-updater --update
    elif command -v topgrade >/dev/null 2>&1; then
      topgrade --config /usr/share/ublue-os/topgrade.toml --keep
    else
      sudo uupd --hw-check=false --json --log-level=debug | jq -r '[(.title, .msg, .description) | select(.)] | join(" ")'
    fi

# Update device firmware
[group("system")]
update-firmware:
    fwupdmgr refresh --force
    fwupdmgr get-updates
    fwupdmgr update

# Turn automatic updates on or off
[group("system")]
toggle-updates ACTION="prompt":
    #!/usr/bin/bash
    source /usr/lib/ujust/ujust.sh
    CURRENT_STATE="$(systemctl is-enabled uupd.timer)"
    OPTION={{ ACTION }}
    if [ "$OPTION" == "prompt" ]; then
      echo "Automatic updates are currently: ${bold}${CURRENT_STATE^}${normal}"
      echo "Enable or Disable automatic updates?"
      OPTION=$(ugum choose Enable Disable)
    elif [ "$OPTION" == "help" ]; then
      echo "Usage: ujust toggle-updates <option>"
      echo "  <option>: Specify the quick option - 'enable' or 'disable'"
      echo "  Use 'enable' to Enable automatic updates."
      echo "  Use 'disable' to Disable automatic updates."
      exit 0
    fi
    if [ "${OPTION,,}" == "enable" ]; then
      sudo systemctl enable uupd.timer
    elif [ "${OPTION,,}" == "disable" ]; then
      sudo systemctl disable uupd.timer
    fi

alias changelog := changelogs

# Show the stable changelog
[group("system")]
changelogs:
    #!/usr/bin/bash
    CONTENT=$(curl -s https://api.github.com/repos/bogdan-d/serpentine/releases/latest | jq -r '.body')
      echo "$CONTENT" | glow -

# Show the testing (pre-release) changelog
[group("system")]
changelogs-testing:
    #!/usr/bin/bash
    CONTENT=$(curl -s https://api.github.com/repos/bogdan-d/serpentine/releases | jq -r 'map(select(.prerelease)) | .[0].body')
       echo "$CONTENT" | glow -
