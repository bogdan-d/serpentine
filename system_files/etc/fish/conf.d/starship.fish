#!/usr/bin/env fish
# System-wide Starship initializer for fish shells

# Only run for interactive fish shells
if not status --is-interactive
    exit
end

if type -q starship
    starship init fish | source
end
