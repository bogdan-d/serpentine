#!/usr/bin/env bash
set -xeuo pipefail

# Add serpentine just file
echo "import \"/usr/share/ublue-os/just/95-serpentine.just\"" >> /usr/share/ublue-os/justfile
