#!/usr/bin/env bash
# Builds the job-site website's "inside the house" media into public/jobsite/.
#
#   bash scripts/jobsite-media.sh <folder with the owner's originals>
#
# Originals (from the owner, 26 Sep 2026, one of his builds in Tauranga):
#   segment_video_2.MP4, "segment_video_2 2.MP4", "segment_video_2 3.MP4"
#     15 s portrait walkthroughs, 720×1280
#   IMG_3250.HEIC (finished deck and glass gable), IMG_3257.HEIC (finished front entry)
#
# Every output has its sound removed and all metadata stripped. The photos'
# GPS location (the house's address) must never reach the website.
# The first seconds of "segment_video_2 3" (a parked car's number plate
# through the front door) are deliberately not used.
# Needs macOS (sips) and the ffmpeg that ships with Remotion.
set -euo pipefail
SRC="${1:?folder with the originals}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN="$ROOT/node_modules/@remotion/compositor-darwin-arm64"
OUT="$ROOT/public/jobsite"
ff() { DYLD_LIBRARY_PATH="$BIN" "$BIN/ffmpeg" -v error -y "$@"; }
mkdir -p "$OUT/rooms"

A="$SRC/segment_video_2.MP4"
B="$SRC/segment_video_2 2.MP4"
C="$SRC/segment_video_2 3.MP4"

# room | source | start | length | still (a representative moment)
room() {
  local name=$1 src=$2 start=$3 len=$4 still=$5
  # Computer cut and phone cut: H.264, no sound, fast start.
  ff -ss "$start" -t "$len" -i "$src" -an -map_metadata -1 -vf "scale=720:1280" -r 30 \
    -c:v libx264 -preset slow -crf 26 -pix_fmt yuv420p -profile:v high -movflags +faststart "$OUT/rooms/$name-720.mp4"
  ff -ss "$start" -t "$len" -i "$src" -an -map_metadata -1 -vf "scale=540:960" -r 30 \
    -c:v libx264 -preset slow -crf 28 -pix_fmt yuv420p -profile:v main -movflags +faststart "$OUT/rooms/$name-540.mp4"
  # First frame (the video's poster, so it starts seamlessly) and the still.
  ff -ss "$start" -i "$src" -frames:v 1 -map_metadata -1 -vf "scale=720:1280" -q:v 4 "$OUT/rooms/$name-first.jpg"
  ff -ss "$still" -i "$src" -frames:v 1 -map_metadata -1 -vf "scale=720:1280" -q:v 4 "$OUT/rooms/$name.jpg"
}
room talk  "$A" 12.4 2.6 14.2   # turning into the hallway, walking down it
room draft "$B" 1.5  4.0 4.8    # the living area, past the fireplace, to the bifolds over the city
room check "$C" 6.0  4.5 7.2    # the raked sarking ceiling and the scaffold
room send  "$A" 7.0  3.6 8.2    # the big window to the sliding door

# The finished home: orientation applied by sips, then re-encoded without metadata.
TMP="$(mktemp -d)"
sips -s format jpeg -Z 1800 "$SRC/IMG_3257.HEIC" --out "$TMP/front.jpg" >/dev/null
sips -s format jpeg -Z 2400 "$SRC/IMG_3250.HEIC" --out "$TMP/deck.jpg" >/dev/null
ff -i "$TMP/front.jpg" -map_metadata -1 -q:v 3 "$OUT/finished-front.jpg"
ff -i "$TMP/deck.jpg" -map_metadata -1 -q:v 3 "$OUT/finished-deck.jpg"
rm -rf "$TMP"

# The floating phone's screens are not made here: Remotion renders them
# (node scripts/render-marketing.mjs --only=steps → public/jobsite/screens).

echo "done: $(du -sh "$OUT" | cut -f1) in $OUT"
