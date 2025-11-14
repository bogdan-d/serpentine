#!/usr/bin/env bash

# Recursive: set directories to 755 and files to 644
fix_perms() {
    if [ $# -eq 0 ]; then
        echo "Usage: fix_perms <path> ..."
        return 1
    fi
    for target in "$@"; do
        [ -e "$target" ] || { echo "Not found: $target"; continue; }
        find "$target" -type d -exec chmod 755 {} +
        find "$target" -type f -exec chmod 644 {} +
    done
}

# Make scripts executable by file extension or shebang
make_scripts_exec() {
    if [ $# -eq 0 ]; then
        echo "Usage: make_scripts_exec <path> [ext...], e.g. make_scripts_exec . sh php py"
        return 1
    fi
    target="$1"
    shift
    if [ ! -d "$target" ]; then
        echo "Not a directory: $target"
        return 1
    fi
    if [ $# -gt 0 ]; then
        for ext in "$@"; do
            find "$target" -type f -name "*.${ext}" -exec chmod 755 {} +
        done
    else
        # fallback: mark files with a shebang as executable
        # Use null-delimited output so filenames with whitespace/special chars are handled
        find "$target" -type f -exec awk 'NR==1 && /^#!/{printf "%s\0", FILENAME}' {} + | xargs -0 -r chmod 755
    fi
}
