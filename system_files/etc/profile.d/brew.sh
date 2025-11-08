#!/usr/bin/env bash

# Load Homebrew environment for interactive shells only
#[[ -d /home/linuxbrew/.linuxbrew && $- == *i* ]] && eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"

# Load Homebrew environment for ALL shells
[[ -d /home/linuxbrew/.linuxbrew ]] && eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"

# Alternative manual setup (uncomment if needed)
# pathmunge /home/linuxbrew/.linuxbrew/bin before
# pathmunge /home/linuxbrew/.linuxbrew/sbin before
# export HOMEBREW_PREFIX="/home/linuxbrew/.linuxbrew";
# export HOMEBREW_CELLAR="/home/linuxbrew/.linuxbrew/Cellar";
# export HOMEBREW_REPOSITORY="/home/linuxbrew/.linuxbrew/Homebrew";
# export PATH="/home/linuxbrew/.linuxbrew/bin:/home/linuxbrew/.linuxbrew/sbin${PATH+:$PATH}";
# [ -z "${MANPATH-}" ] || export MANPATH=":${MANPATH#:}";
# export INFOPATH="/home/linuxbrew/.linuxbrew/share/info:${INFOPATH:-}";
