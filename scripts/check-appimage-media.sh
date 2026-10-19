#!/usr/bin/env bash
# Run on the build system so gst-inspect matches the bundled GStreamer ABI.
set -euo pipefail

export APPDIR
APPDIR=$(realpath "${1:?Usage: check-appimage-media.sh /path/to/extracted.AppDir}")
hook="$APPDIR/apprun-hooks/linuxdeploy-plugin-gstreamer.sh"
if [[ ! -f "$hook" ]]; then
  echo "Missing GStreamer AppRun hook: $hook" >&2
  exit 1
fi

# Use the packaged relocation hook and a fresh registry. Host plugins and an
# existing user registry must not hide missing or incompatible bundled plugins.
unset GST_PLUGIN_PATH GST_PLUGIN_PATH_1_0 GST_PLUGIN_SYSTEM_PATH GST_PLUGIN_SYSTEM_PATH_1_0
unset GST_PLUGIN_SCANNER GST_PLUGIN_SCANNER_1_0
source "$hook"
for path in "${GST_PLUGIN_SYSTEM_PATH_1_0:?}" "${GST_PLUGIN_PATH_1_0:?}" "${GST_PLUGIN_SCANNER_1_0:?}"; do
  if [[ $(realpath "$path") != "$APPDIR/"* ]]; then
    echo "GStreamer path escapes the AppImage: $path" >&2
    exit 1
  fi
done
test -d "$GST_PLUGIN_SYSTEM_PATH_1_0"
test -x "$GST_PLUGIN_SCANNER_1_0"
export LD_LIBRARY_PATH="$APPDIR/usr/lib:$APPDIR/usr/lib/$(uname -m)-linux-gnu"
export LC_ALL=C
registry_dir=$(mktemp -d)
trap 'rm -rf "$registry_dir"' EXIT
export GST_REGISTRY="$registry_dir/registry.bin"
export GST_REGISTRY_1_0="$GST_REGISTRY"

gst-inspect-1.0 --print-blacklist > "$registry_dir/blacklist.txt" 2> "$registry_dir/scan.log"
cat "$registry_dir/scan.log" "$registry_dir/blacklist.txt"
grep -qx 'Total count: 0 blacklisted files' "$registry_dir/blacklist.txt"
if grep -Eiq 'Failed to load plugin|External plugin loader failed' "$registry_dir/scan.log"; then
  exit 1
fi

for element in autoaudiosink appsink audioconvert audioresample decodebin pulsesink \
  wavparse vorbisdec oggdemux flacdec avdec_mp3; do
  gst-inspect-1.0 "$element" > /dev/null
  echo "Found bundled GStreamer element: $element"
done
