#!/bin/bash
# process_video.sh — Extract frames from video for 3DGS training
# 
# Usage: ./process_video.sh <video_file> <output_dir> [fps]
#
# Example: ./process_video.sh okavango.mp4 processing/okavango_delta 1

set -euo pipefail

if [ $# -lt 2 ]; then
  echo "Usage: $0 <video_file> <output_dir> [fps]"
  echo ""
  echo "  video_file  — Path to downloaded video"
  echo "  output_dir  — Directory to save extracted frames"
  echo "  fps         — Frames per second (default: 1)"
  exit 1
fi

VIDEO="$1"
OUTPUT_DIR="$2"
FPS="${3:-1}"

if [ ! -f "$VIDEO" ]; then
  echo "❌ Video file not found: $VIDEO"
  exit 1
fi

mkdir -p "$OUTPUT_DIR/frames"

echo "🎬 Extracting frames from: $VIDEO"
echo "   Output: $OUTPUT_DIR/frames"
echo "   FPS: $FPS"

# Extract frames
ffmpeg -i "$VIDEO" \
  -vf "fps=$FPS" \
  -q:v 2 \
  "$OUTPUT_DIR/frames/frame_%04d.jpg" \
  -y 2>/dev/null

FRAME_COUNT=$(ls "$OUTPUT_DIR/frames/"*.jpg 2>/dev/null | wc -l)
echo ""
echo "✅ Extracted $FRAME_COUNT frames"

# Filter blurry frames using OpenCV
echo "🔍 Filtering blurry frames..."
python3 -c "
import cv2
import os
import glob

frames_dir = '$OUTPUT_DIR/frames'
threshold = 100.0

files = sorted(glob.glob(os.path.join(frames_dir, 'frame_*.jpg')))
removed = 0

for f in files:
    img = cv2.imread(f, cv2.IMREAD_GRAYSCALE)
    if img is None:
        os.remove(f)
        removed += 1
        continue
    
    laplacian_var = cv2.Laplacian(img, cv2.CV_64F).var()
    if laplacian_var < threshold:
        os.remove(f)
        removed += 1

remaining = len(glob.glob(os.path.join(frames_dir, 'frame_*.jpg')))
print(f'   Removed {removed} blurry frames')
print(f'   Kept {remaining} frames')
"

# Create metadata
TOTAL=$(ls "$OUTPUT_DIR/frames/"*.jpg 2>/dev/null | wc -l)
cat > "$OUTPUT_DIR/metadata.json" << EOF
{
  "source_video": "$(basename "$VIDEO")",
  "fps_extracted": $FPS,
  "total_frames": $TOTAL,
  "output_dir": "$OUTPUT_DIR"
}
EOF

echo ""
echo "📋 Metadata saved to: $OUTPUT_DIR/metadata.json"
echo ""
echo "   Ready for Colab training!"
echo "   Upload frames to GCS: gsutil -m cp -r $OUTPUT_DIR/frames gs://lumenary-raw-vault/scenes/<name>/frames/"
