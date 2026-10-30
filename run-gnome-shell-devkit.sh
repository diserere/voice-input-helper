#!/usr/bin/env bash

# Поиск по логам при запуске в нативной сессии:
# journalctl -b /usr/bin/gnome-shell -f | grep -iE 'voice-input-helper|diserere\.github\.com|JS ERROR'


dbus-run-session -- gnome-shell --devkit 2>&1 | tee .tmp/devkit.log | grep -iE 'voice-input-helper|diserere\.github\.com|JS ERROR'
