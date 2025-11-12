#!/usr/bin/env sh
# System-wide Starship prompt initializer (POSIX/sh compatible)
# Runs only for interactive shells and only when `starship` is installed.

# Exit early for non-interactive shells
case "$-" in
  *i*) ;;
  *) return 0;;
esac

# If starship is not available, do nothing
if ! command -v starship >/dev/null 2>&1; then
  return 0
fi

# Prefer shell-specific init where supported
if [ -n "${BASH_VERSION-}" ]; then
  # bash
  eval "$(starship init bash)"
elif [ -n "${ZSH_VERSION-}" ]; then
  # zsh
  eval "$(starship init zsh)"
fi
