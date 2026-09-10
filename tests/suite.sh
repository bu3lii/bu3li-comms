#!/usr/bin/env bash
set -euo pipefail

BASE_URL="http://localhost:8080"

ALICE_EMAIL="alice@example.com"
ALICE_PASSWORD="supersecret"

BOB_EMAIL="bob@example.com"
BOB_PASSWORD="supersecret"

ALICE_COOKIES="./alice-cookies.txt"
BOB_COOKIES="./bob-cookies.txt"

cleanup() {
  rm -f "$ALICE_COOKIES" "$BOB_COOKIES"
}
trap cleanup EXIT

echo "==> Logging in Alice"

ALICE_LOGIN_RESPONSE=$(curl -sS -i -c "$ALICE_COOKIES" \
  -X POST "$BASE_URL/login" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$ALICE_EMAIL\",
    \"password\": \"$ALICE_PASSWORD\"
  }")

echo "$ALICE_LOGIN_RESPONSE" | head -n 1

echo "==> Fetching Alice"

ALICE_JSON=$(curl -sS -b "$ALICE_COOKIES" "$BASE_URL/me")
echo "$ALICE_JSON"

ALICE_ID=$(echo "$ALICE_JSON" | python3 -c '
import sys, json
print(json.load(sys.stdin)["id"])
')

echo "Alice ID: $ALICE_ID"

echo
echo "==> Logging in Bob"

BOB_LOGIN_RESPONSE=$(curl -sS -i -c "$BOB_COOKIES" \
  -X POST "$BASE_URL/login" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$BOB_EMAIL\",
    \"password\": \"$BOB_PASSWORD\"
  }")

echo "$BOB_LOGIN_RESPONSE" | head -n 1

echo "==> Fetching Bob"

BOB_JSON=$(curl -sS -b "$BOB_COOKIES" "$BASE_URL/me")
echo "$BOB_JSON"

BOB_ID=$(echo "$BOB_JSON" | python3 -c '
import sys, json
print(json.load(sys.stdin)["id"])
')

echo "Bob ID: $BOB_ID"

echo
echo "==> Creating direct conversation as Alice"

CONVERSATION_JSON=$(curl -sS -b "$ALICE_COOKIES" \
  -X POST "$BASE_URL/conversations" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "direct"
  }')

echo "$CONVERSATION_JSON"

CONVERSATION_ID=$(echo "$CONVERSATION_JSON" | python3 -c '
import sys, json
print(json.load(sys.stdin)["id"])
')

echo "Conversation ID: $CONVERSATION_ID"

echo
echo "==> Adding Bob to conversation"

ADD_MEMBER_STATUS=$(curl -sS -o /dev/null -w "%{http_code}" \
  -b "$ALICE_COOKIES" \
  -X POST "$BASE_URL/conversations/$CONVERSATION_ID/members" \
  -H "Content-Type: application/json" \
  -d "{
    \"user_id\": \"$BOB_ID\"
  }")

echo "Add member status: $ADD_MEMBER_STATUS"

if [[ "$ADD_MEMBER_STATUS" != "204" ]]; then
  echo "ERROR: expected 204 when adding Bob"
  exit 1
fi

echo
echo "==> Creating message as Bob"

CLIENT_MESSAGE_ID=$(uuidgen | tr '[:upper:]' '[:lower:]')

MESSAGE_JSON=$(curl -sS -b "$BOB_COOKIES" \
  -X POST "$BASE_URL/conversations/$CONVERSATION_ID/messages" \
  -H "Content-Type: application/json" \
  -d "{
    \"client_message_id\": \"$CLIENT_MESSAGE_ID\",
    \"content\": \"hello alice from automated test\"
  }")

echo "$MESSAGE_JSON"

MESSAGE_ID=$(echo "$MESSAGE_JSON" | python3 -c '
import sys, json
print(json.load(sys.stdin)["id"])
')

MESSAGE_VERSION=$(echo "$MESSAGE_JSON" | python3 -c '
import sys, json
print(json.load(sys.stdin)["version"])
')

echo "Message ID: $MESSAGE_ID"
echo "Message version: $MESSAGE_VERSION"

echo
echo "==> Listing conversation messages"

curl -sS -b "$ALICE_COOKIES" \
  "$BASE_URL/conversations/$CONVERSATION_ID/messages"

echo
echo
echo "==> Testing valid edit as Bob"

EDIT_RESPONSE_FILE=$(mktemp)

EDIT_STATUS=$(curl -sS \
  -o "$EDIT_RESPONSE_FILE" \
  -w "%{http_code}" \
  -b "$BOB_COOKIES" \
  -X PATCH "$BASE_URL/messages/$MESSAGE_ID" \
  -H "Content-Type: application/json" \
  -d "{
    \"content\": \"hello alice - edited\",
    \"version\": $MESSAGE_VERSION
  }")

echo "Edit status: $EDIT_STATUS"
cat "$EDIT_RESPONSE_FILE"
echo

if [[ "$EDIT_STATUS" != "200" ]]; then
  echo "ERROR: expected successful edit"
  rm -f "$EDIT_RESPONSE_FILE"
  exit 1
fi

NEW_VERSION=$(python3 - "$EDIT_RESPONSE_FILE" <<'PY'
import sys, json
with open(sys.argv[1]) as f:
    print(json.load(f)["version"])
PY
)

rm -f "$EDIT_RESPONSE_FILE"

echo "New version: $NEW_VERSION"

echo
echo "==> Testing stale edit conflict"

STALE_STATUS=$(curl -sS \
  -o /tmp/bu3li-stale-response.txt \
  -w "%{http_code}" \
  -b "$BOB_COOKIES" \
  -X PATCH "$BASE_URL/messages/$MESSAGE_ID" \
  -H "Content-Type: application/json" \
  -d "{
    \"content\": \"this stale edit should fail\",
    \"version\": $MESSAGE_VERSION
  }")

echo "Stale edit status: $STALE_STATUS"
cat /tmp/bu3li-stale-response.txt
echo

if [[ "$STALE_STATUS" != "409" ]]; then
  echo "ERROR: expected 409 conflict"
  exit 1
fi

echo
echo "==> Testing Alice cannot edit Bob's message"

OWNERSHIP_STATUS=$(curl -sS \
  -o /tmp/bu3li-ownership-response.txt \
  -w "%{http_code}" \
  -b "$ALICE_COOKIES" \
  -X PATCH "$BASE_URL/messages/$MESSAGE_ID" \
  -H "Content-Type: application/json" \
  -d "{
    \"content\": \"alice should not be allowed to edit this\",
    \"version\": $NEW_VERSION
  }")

echo "Ownership test status: $OWNERSHIP_STATUS"
cat /tmp/bu3li-ownership-response.txt
echo

if [[ "$OWNERSHIP_STATUS" == "200" ]]; then
  echo "ERROR: Alice was able to edit Bob's message"
  exit 1
fi

echo
echo "==> Testing deletion as Bob"

DELETE_STATUS=$(curl -sS \
  -o /dev/null \
  -w "%{http_code}" \
  -b "$BOB_COOKIES" \
  -X DELETE "$BASE_URL/messages/$MESSAGE_ID")

echo "Delete status: $DELETE_STATUS"

if [[ "$DELETE_STATUS" != "204" ]]; then
  echo "ERROR: expected 204 from delete"
  exit 1
fi

echo
echo "==> Verifying deleted message is gone"

curl -sS -b "$ALICE_COOKIES" \
  "$BASE_URL/conversations/$CONVERSATION_ID/messages"

echo
echo
echo "======================================"
echo "HTTP TESTS PASSED"
echo "======================================"
echo
echo "Alice ID:"
echo "$ALICE_ID"
echo
echo "Bob ID:"
echo "$BOB_ID"
echo
echo "Conversation ID:"
echo "$CONVERSATION_ID"
echo
echo "Alice session:"
grep session_id "$ALICE_COOKIES" | awk '{print $7}'
echo
echo "Bob session:"
grep session_id "$BOB_COOKIES" | awk '{print $7}'
echo
echo "For WebSocket testing, temporarily remove the cleanup trap"
echo "or comment out:"
echo '  trap cleanup EXIT'
echo
echo "Then connect with:"
echo
echo "websocat -H='Cookie: session_id=ALICE_SESSION' ws://localhost:8080/ws"
echo "websocat -H='Cookie: session_id=BOB_SESSION' ws://localhost:8080/ws"
