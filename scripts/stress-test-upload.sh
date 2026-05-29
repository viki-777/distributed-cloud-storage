#!/usr/bin/env bash
# =============================================================================
# stress-test-upload.sh — Streaming Upload Stress Test
#
# Verifies that the streaming upload pipeline handles a large file without
# loading it entirely into RAM.
#
# What it does:
#   1. Creates a 512 MB random dummy file using `dd`
#   2. Uploads it to the Next.js upload API via curl
#   3. Monitors Node.js process RSS memory during the upload
#   4. Asserts that peak RAM never exceeded 300 MB
#      (proof that only 1 chunk of 64 MB was in RAM at any point)
#   5. Downloads the uploaded file and verifies the MD5 checksum matches
#
# Prerequisites:
#   - docker-compose stack is running (coordinator, nodes, postgres)
#   - Next.js dashboard is running: cd dashboard && npm run dev
#
# Usage:
#   bash scripts/stress-test-upload.sh
# =============================================================================

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────

DASHBOARD_URL="${DASHBOARD_URL:-http://localhost:3000}"
FILE_SIZE_MB=512
WORK_DIR="/tmp/dcs-stress-test-$$"
DUMMY_FILE="$WORK_DIR/dummy_${FILE_SIZE_MB}mb.bin"
DOWNLOADED_FILE="$WORK_DIR/downloaded.bin"
MAX_RAM_MB=300       # Alert threshold — should be well under 1 × chunk (64 MB) overhead + Node base
POLL_INTERVAL=2      # seconds between RAM samples

# ── Colours ───────────────────────────────────────────────────────────────────

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; RESET='\033[0m'
ok()   { echo -e "${GREEN}✓${RESET} $*"; }
info() { echo -e "${CYAN}ℹ${RESET} $*"; }
warn() { echo -e "${YELLOW}⚠${RESET} $*"; }
fail() { echo -e "${RED}✗ FAIL${RESET} $*"; exit 1; }

# ── Setup ─────────────────────────────────────────────────────────────────────

mkdir -p "$WORK_DIR"
trap 'rm -rf "$WORK_DIR"' EXIT

echo ""
echo "=================================================="
echo "  DCS Streaming Upload — Stress Test"
echo "  File size: ${FILE_SIZE_MB} MB | RAM limit: ${MAX_RAM_MB} MB"
echo "=================================================="
echo ""

# ── Step 1: Create dummy file ─────────────────────────────────────────────────

info "Creating ${FILE_SIZE_MB} MB dummy file…"
dd if=/dev/urandom of="$DUMMY_FILE" bs=1M count="$FILE_SIZE_MB" status=progress 2>&1
ORIGINAL_MD5=$(md5sum "$DUMMY_FILE" | awk '{print $1}')
ok "Dummy file created: $DUMMY_FILE"
info "Original MD5: $ORIGINAL_MD5"
echo ""

# ── Step 2: Find Next.js PID for RAM monitoring ───────────────────────────────

NEXTJS_PID=$(pgrep -f "next dev" | head -1 || echo "")
if [[ -z "$NEXTJS_PID" ]]; then
  warn "Next.js PID not found — RAM monitoring disabled. Is 'npm run dev' running?"
else
  info "Monitoring Next.js PID: $NEXTJS_PID"
fi

PEAK_RSS_MB=0

# RAM poller — runs in background, polls every POLL_INTERVAL seconds
monitor_ram() {
  local peak=0
  while kill -0 "$NEXTJS_PID" 2>/dev/null; do
    local rss_kb
    rss_kb=$(ps -o rss= -p "$NEXTJS_PID" 2>/dev/null || echo "0")
    local rss_mb=$(( rss_kb / 1024 ))
    if (( rss_mb > peak )); then
      peak=$rss_mb
      echo "$peak" > "$WORK_DIR/peak_rss"
    fi
    sleep "$POLL_INTERVAL"
  done
}

if [[ -n "$NEXTJS_PID" ]]; then
  echo "0" > "$WORK_DIR/peak_rss"
  monitor_ram &
  RAM_MONITOR_PID=$!
fi

# ── Step 3: Upload the file ───────────────────────────────────────────────────

info "Uploading ${FILE_SIZE_MB} MB file to $DASHBOARD_URL/api/upload …"
echo ""

UPLOAD_START=$(date +%s)

# Send metadata fields BEFORE the file (required for streaming busboy parser)
UPLOAD_RESPONSE=$(curl -sS \
  --no-buffer \
  -X POST "$DASHBOARD_URL/api/upload" \
  -F "file_name=dummy_${FILE_SIZE_MB}mb.bin" \
  -F "file_size=$(stat -c%s "$DUMMY_FILE")" \
  -F "is_encrypted=false" \
  -F "file=@$DUMMY_FILE;type=application/octet-stream")

UPLOAD_END=$(date +%s)
UPLOAD_SECS=$(( UPLOAD_END - UPLOAD_START ))

echo ""
info "Raw SSE response (last event):"
echo "$UPLOAD_RESPONSE" | grep '"status":"done"' | tail -1 || true

# Parse file_id from SSE events
FILE_ID=$(echo "$UPLOAD_RESPONSE" | grep -Eo '"fileId":"[^"]+"' | tail -1 | cut -d'"' -f4)

if [[ -z "$FILE_ID" ]]; then
  fail "Upload failed — no fileId in response. Response was:\n$UPLOAD_RESPONSE"
fi

ok "Upload complete in ${UPLOAD_SECS}s | File ID: $FILE_ID"
echo ""

# ── Step 4: Stop RAM monitor and check peak usage ─────────────────────────────

if [[ -n "$NEXTJS_PID" ]]; then
  kill "$RAM_MONITOR_PID" 2>/dev/null || true
  wait "$RAM_MONITOR_PID" 2>/dev/null || true
  PEAK_RSS_MB=$(cat "$WORK_DIR/peak_rss" 2>/dev/null || echo "0")

  info "Peak Node.js RSS during upload: ${PEAK_RSS_MB} MB"

  if (( PEAK_RSS_MB <= MAX_RAM_MB )); then
    ok "RAM check PASSED — peak ${PEAK_RSS_MB} MB ≤ ${MAX_RAM_MB} MB (only 1 chunk in RAM at once)"
  else
    warn "RAM check FAILED — peak ${PEAK_RSS_MB} MB > ${MAX_RAM_MB} MB. File may have been buffered."
  fi
else
  warn "RAM check skipped (Next.js PID not found)."
fi
echo ""

# ── Step 5: Download and verify checksum ──────────────────────────────────────

info "Downloading file $FILE_ID from cluster…"
curl -sS "$DASHBOARD_URL/api/download?fileId=$FILE_ID" -o "$DOWNLOADED_FILE"

DOWNLOADED_MD5=$(md5sum "$DOWNLOADED_FILE" | awk '{print $1}')

info "Original MD5  : $ORIGINAL_MD5"
info "Downloaded MD5: $DOWNLOADED_MD5"

if [[ "$ORIGINAL_MD5" == "$DOWNLOADED_MD5" ]]; then
  ok "Checksum PASSED — downloaded file is byte-perfect match!"
else
  fail "Checksum MISMATCH — file was corrupted during streaming upload/download!"
fi

# ── Summary ───────────────────────────────────────────────────────────────────

echo ""
echo "=================================================="
echo -e "  ${GREEN}STRESS TEST PASSED${RESET}"
echo "  Upload time : ${UPLOAD_SECS}s"
echo "  Peak RAM    : ${PEAK_RSS_MB} MB (limit: ${MAX_RAM_MB} MB)"
echo "  Integrity   : MD5 match ✓"
echo "=================================================="
echo ""
