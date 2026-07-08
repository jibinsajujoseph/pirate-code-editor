#!/usr/bin/env bash
# ───────────────────────────────────────────────────────────
# Akumen Code — Sandbox end-to-end test script
# Tests the full container lifecycle via curl against the API.
# Usage: bash test_sandbox.sh [BASE_URL]
# ───────────────────────────────────────────────────────────

set -euo pipefail

BASE_URL="${1:-http://localhost:8000}"
PASS=0
FAIL=0

green() { printf "\033[32m%s\033[0m\n" "$1"; }
red()   { printf "\033[31m%s\033[0m\n" "$1"; }
bold()  { printf "\033[1m%s\033[0m\n" "$1"; }

check() {
    local desc="$1"
    local condition="$2"
    if eval "$condition"; then
        green "  ✓ $desc"
        PASS=$((PASS + 1))
    else
        red "  ✗ $desc"
        FAIL=$((FAIL + 1))
    fi
}

# ── 0. Health check ────────────────────────────────────
bold "── Health Check ──"
HEALTH=$(curl -s "$BASE_URL/health")
echo "  Response: $HEALTH"
check "Docker connected" "echo '$HEALTH' | grep -q '\"docker_connected\":true'"
check "Python image available" "echo '$HEALTH' | grep -q '\"python\":true'"
check "Node image available" "echo '$HEALTH' | grep -q '\"javascript\":true'"

# ── 1. Create Python session ──────────────────────────
bold ""
bold "── Python Session ──"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/sessions" \
    -H "Content-Type: application/json" \
    -d '{"language":"python","duration_minutes":30}')
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -n -1)
echo "  Create response ($HTTP_CODE): $BODY"
check "Session created (201)" "[ '$HTTP_CODE' = '201' ]"

PY_SESSION_ID=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['session_id'])" 2>/dev/null || echo "")
check "Got session ID" "[ -n '$PY_SESSION_ID' ]"

# ── 2. Write a Python file ────────────────────────────
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/sessions/$PY_SESSION_ID/files" \
    -H "Content-Type: application/json" \
    -d '{"filename":"hello.py","content":"print(\"Hello from sandbox!\")"}')
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -n -1)
echo "  Write file ($HTTP_CODE): $BODY"
check "File written (200)" "[ '$HTTP_CODE' = '200' ]"

# ── 3. Execute the Python file ────────────────────────
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/sessions/$PY_SESSION_ID/execute" \
    -H "Content-Type: application/json" \
    -d '{"filename":"hello.py"}')
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -n -1)
echo "  Execute ($HTTP_CODE): $BODY"
check "Execution succeeded (200)" "[ '$HTTP_CODE' = '200' ]"
check "stdout contains 'Hello from sandbox!'" "echo '$BODY' | grep -q 'Hello from sandbox!'"
check "exit_code is 0" "echo '$BODY' | grep -q '\"exit_code\":0'"
check "Not timed out" "echo '$BODY' | grep -q '\"timed_out\":false'"

# ── 4. Update and re-run (same container) ─────────────
bold ""
bold "── Re-run in Same Container ──"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/sessions/$PY_SESSION_ID/files" \
    -H "Content-Type: application/json" \
    -d '{"filename":"hello.py","content":"for i in range(3): print(f\"Line {i}\")"}')
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
check "File updated (200)" "[ '$HTTP_CODE' = '200' ]"

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/sessions/$PY_SESSION_ID/execute" \
    -H "Content-Type: application/json" \
    -d '{"filename":"hello.py"}')
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -n -1)
echo "  Re-execute ($HTTP_CODE): $BODY"
check "Re-execution succeeded (200)" "[ '$HTTP_CODE' = '200' ]"
check "stdout contains 'Line 2'" "echo '$BODY' | grep -q 'Line 2'"

# ── 5. JavaScript session ─────────────────────────────
bold ""
bold "── JavaScript Session ──"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/sessions" \
    -H "Content-Type: application/json" \
    -d '{"language":"javascript","duration_minutes":30}')
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -n -1)
echo "  Create response ($HTTP_CODE): $BODY"
check "JS session created (201)" "[ '$HTTP_CODE' = '201' ]"

JS_SESSION_ID=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['session_id'])" 2>/dev/null || echo "")
check "Got JS session ID" "[ -n '$JS_SESSION_ID' ]"

# Write and execute JS
curl -s -X POST "$BASE_URL/sessions/$JS_SESSION_ID/files" \
    -H "Content-Type: application/json" \
    -d '{"filename":"hello.js","content":"console.log(\"Hello from Node.js!\")"}' > /dev/null

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/sessions/$JS_SESSION_ID/execute" \
    -H "Content-Type: application/json" \
    -d '{"filename":"hello.js"}')
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -n -1)
echo "  Execute ($HTTP_CODE): $BODY"
check "JS execution succeeded (200)" "[ '$HTTP_CODE' = '200' ]"
check "stdout contains 'Hello from Node.js!'" "echo '$BODY' | grep -q 'Hello from Node.js!'"

# ── 6. Timeout test ───────────────────────────────────
bold ""
bold "── Timeout Test ──"
curl -s -X POST "$BASE_URL/sessions/$PY_SESSION_ID/files" \
    -H "Content-Type: application/json" \
    -d '{"filename":"infinite.py","content":"import time\nwhile True:\n    time.sleep(0.1)"}' > /dev/null

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/sessions/$PY_SESSION_ID/execute" \
    -H "Content-Type: application/json" \
    -d '{"filename":"infinite.py"}')
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -n -1)
echo "  Timeout execute ($HTTP_CODE): $BODY"
check "Timeout execution returned (200)" "[ '$HTTP_CODE' = '200' ]"
check "Timed out flag is true" "echo '$BODY' | grep -q '\"timed_out\":true'"

# ── 7. Error handling (stderr) ────────────────────────
bold ""
bold "── Error Handling ──"
curl -s -X POST "$BASE_URL/sessions/$PY_SESSION_ID/files" \
    -H "Content-Type: application/json" \
    -d '{"filename":"error.py","content":"raise ValueError(\"oops\")"}' > /dev/null

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/sessions/$PY_SESSION_ID/execute" \
    -H "Content-Type: application/json" \
    -d '{"filename":"error.py"}')
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -n -1)
echo "  Error execute ($HTTP_CODE): $BODY"
check "Error execution returned (200)" "[ '$HTTP_CODE' = '200' ]"
check "exit_code is non-zero" "echo '$BODY' | grep -qv '\"exit_code\":0'"
check "stderr contains 'ValueError'" "echo '$BODY' | grep -q 'ValueError'"

# ── 8. Session info ───────────────────────────────────
bold ""
bold "── Session Info ──"
RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/sessions/$PY_SESSION_ID")
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -n -1)
echo "  Session info ($HTTP_CODE): $BODY"
check "Session info returned (200)" "[ '$HTTP_CODE' = '200' ]"
check "Files list includes hello.py" "echo '$BODY' | grep -q 'hello.py'"

# ── 9. Tear down ──────────────────────────────────────
bold ""
bold "── Teardown ──"
RESPONSE=$(curl -s -w "\n%{http_code}" -X DELETE "$BASE_URL/sessions/$PY_SESSION_ID")
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
check "Python session destroyed (200)" "[ '$HTTP_CODE' = '200' ]"

RESPONSE=$(curl -s -w "\n%{http_code}" -X DELETE "$BASE_URL/sessions/$JS_SESSION_ID")
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
check "JS session destroyed (200)" "[ '$HTTP_CODE' = '200' ]"

# Verify sessions are gone
RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/sessions/$PY_SESSION_ID")
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
check "Destroyed session returns 404" "[ '$HTTP_CODE' = '404' ]"

# ── Results ───────────────────────────────────────────
bold ""
bold "═══════════════════════════════════"
bold "  Results: $PASS passed, $FAIL failed"
bold "═══════════════════════════════════"

if [ "$FAIL" -gt 0 ]; then
    red "  Some tests failed!"
    exit 1
else
    green "  All tests passed!"
    exit 0
fi
