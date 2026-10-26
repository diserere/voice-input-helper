#!/usr/bin/env bash

dbus-run-session -- gnome-shell --devkit 2>&1 | tee .tmp/devkit.log | grep -iE 'voice-input-helper|diserere\.github\.com|JS ERROR'