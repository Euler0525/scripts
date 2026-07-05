"""Convert JSON auth/session documents from a variety of sources into the
native Codex auth.json format. A single account is emitted as an object;
multiple accounts are emitted as an array.

This module mirrors codex-auth.js function for function so the two CLI tools
stay behaviorally equivalent.
"""

import base64
import json
import math
import sys
import time
from datetime import datetime, timezone


# Force UTF-8 on stdout/stderr so the output is consistent on Windows consoles.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass


def is_plain_object(value):
    """Mirrors JS: Boolean(value) && typeof === "object" && !Array.isArray(value)."""
    return isinstance(value, dict)


def first_non_empty(*values):
    """Mirrors the JS firstNonEmpty: returns the first argument that trims to a
    non-empty string, otherwise None."""
    for value in values:
        if isinstance(value, str) and value.strip() != "":
            return value.strip()
    return None


def dig(obj, *keys):
    """Safely walks a chain of keys, mirroring JS optional chaining (a?.b?.c)."""
    cur = obj
    for key in keys:
        if isinstance(cur, dict) and key in cur:
            cur = cur[key]
        else:
            return None
    return cur


def decode_base64_url(value):
    """Mirrors JS Buffer.from(value, "base64url").toString("utf8")."""
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding).decode("utf-8")


def encode_base64_url_json(value):
    """Mirrors JS Buffer.from(JSON.stringify(value), "utf8").toString("base64url")."""
    data = json.dumps(value, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def parse_jwt_payload(token):
    if not isinstance(token, str) or token.strip() == "":
        return None

    segments = token.split(".")
    if len(segments) < 2:
        return None

    try:
        return json.loads(decode_base64_url(segments[1]))
    except Exception:
        return None


def get_openai_auth_section(payload):
    if not is_plain_object(payload):
        return {}

    auth = payload.get("https://api.openai.com/auth")
    return auth if is_plain_object(auth) else {}


def _format_js_iso(dt):
    """Formats a datetime like JS Date.prototype.toISOString():
    YYYY-MM-DDTHH:mm:ss.sssZ."""
    dt = dt.astimezone(timezone.utc)
    return "%04d-%02d-%02dT%02d:%02d:%02d.%03dZ" % (
        dt.year, dt.month, dt.day,
        dt.hour, dt.minute, dt.second, dt.microsecond // 1000,
    )


def _parse_date_string(value):
    """Best-effort parse of a date string into a UTC datetime, returning None on
    failure (approximates JS new Date(string))."""
    text = value.strip()
    try:
        dt = datetime.fromisoformat(text.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except ValueError:
        pass
    try:
        from email.utils import parsedate_to_datetime
        dt = parsedate_to_datetime(text)
        if dt is None:
            return None
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except (TypeError, ValueError):
        return None


def normalize_timestamp(value):
    if isinstance(value, datetime):
        return _format_js_iso(value)

    if isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value):
        milliseconds = value if value > 1e11 else value * 1000
        try:
            return _format_js_iso(datetime.fromtimestamp(milliseconds / 1000, tz=timezone.utc))
        except (OverflowError, OSError, ValueError):
            return None

    if not isinstance(value, str) or value.strip() == "":
        return None

    dt = _parse_date_string(value)
    return _format_js_iso(dt) if dt is not None else None


def timestamp_from_unix_seconds(value):
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(numeric):
        return None

    try:
        return _format_js_iso(datetime.fromtimestamp(numeric, tz=timezone.utc))
    except (OverflowError, OSError, ValueError):
        return None


def _js_number(value):
    """Approximates JS Number() coercion, used by epoch_seconds_from_value."""
    if isinstance(value, bool):
        return 1.0 if value else 0.0
    if isinstance(value, (int, float)):
        return float(value)
    if value is None:
        return float("nan")
    if isinstance(value, str):
        text = value.strip()
        if text == "":
            return 0.0
        try:
            return float(text)
        except ValueError:
            return float("nan")
    return float("nan")


def epoch_seconds_from_value(value):
    if value is None or value == "":
        return 0

    numeric = _js_number(value)
    if math.isfinite(numeric):
        return math.trunc(numeric / 1000 if numeric > 1e11 else numeric)

    if isinstance(value, str):
        dt = _parse_date_string(value)
        if dt is not None:
            return math.trunc(dt.timestamp())
    return 0


def build_synthetic_codex_id_token(email, account_id, plan_type, user_id, expires_at):
    """Builds a signed-looking (alg: none) synthetic id_token when the source
    document did not provide one, so Codex still receives the account metadata."""
    if not account_id:
        return None

    now = int(time.time())
    auth_info = {"chatgpt_account_id": account_id}
    expires = epoch_seconds_from_value(expires_at) or (now + 90 * 24 * 60 * 60)

    if plan_type:
        auth_info["chatgpt_plan_type"] = plan_type

    if user_id:
        auth_info["chatgpt_user_id"] = user_id
        auth_info["user_id"] = user_id

    payload = {
        "iat": now,
        "exp": expires,
        "https://api.openai.com/auth": auth_info,
    }

    if email:
        payload["email"] = email

    return "%s.%s.synthetic" % (
        encode_base64_url_json({"alg": "none", "typ": "JWT", "cpa_synthetic": True}),
        encode_base64_url_json(payload),
    )


def collect_session_like_objects(value, source_name="pasted-json"):
    """Recursively walks a parsed JSON value and collects every object that
    looks like a session: it carries an access token plus at least one identity
    field."""
    found = []
    visited = set()

    def visit(item, path):
        if not (is_plain_object(item) or isinstance(item, list)):
            return

        if is_plain_object(item):
            oid = id(item)
            if oid in visited:
                return
            visited.add(oid)

            token = first_non_empty(
                item.get("accessToken"),
                item.get("access_token"),
                dig(item, "tokens", "accessToken"),
                dig(item, "tokens", "access_token"),
                dig(item, "token", "accessToken"),
                dig(item, "token", "access_token"),
                dig(item, "credentials", "accessToken"),
                dig(item, "credentials", "access_token"),
            )
            has_identity = is_plain_object(item.get("user")) or first_non_empty(
                item.get("email"),
                item.get("name"),
                item.get("label"),
                dig(item, "meta", "label"),
                dig(item, "tokens", "accountId"),
                dig(item, "tokens", "account_id"),
                dig(item, "tokens", "chatgptAccountId"),
                dig(item, "tokens", "chatgpt_account_id"),
                dig(item, "providerSpecificData", "chatgptAccountId"),
                dig(item, "providerSpecificData", "chatgpt_account_id"),
                item.get("id"),
            )
            if token and has_identity:
                found.append({"value": item, "sourceName": source_name, "path": path})
                return

            for key, child in item.items():
                if key in ("accessToken", "access_token", "sessionToken"):
                    continue
                visit(child, "%s.%s" % (path, key))
            return

        for index, child in enumerate(item):
            visit(child, "%s[%d]" % (path, index))

    visit(value, "$")
    return found


def parse_input_documents(text):
    if not isinstance(text, str) or text.strip() == "":
        return []

    try:
        parsed = json.loads(text)
    except ValueError as error:
        raise ValueError("JSON parsing failed: %s" % error)

    return collect_session_like_objects(parsed)


# --- Core: a single record -> Codex auth.json ---

def to_codex_auth(record, options=None):
    if options is None:
        options = {}

    if not is_plain_object(record):
        raise ValueError("session is not a JSON object")

    access_token = first_non_empty(
        record.get("accessToken"),
        record.get("access_token"),
        dig(record, "tokens", "accessToken"),
        dig(record, "tokens", "access_token"),
        dig(record, "token", "accessToken"),
        dig(record, "token", "access_token"),
        dig(record, "credentials", "accessToken"),
        dig(record, "credentials", "access_token"),
    )
    if not access_token:
        raise ValueError("accessToken is missing")

    refresh_token = first_non_empty(
        record.get("refreshToken"),
        record.get("refresh_token"),
        dig(record, "tokens", "refreshToken"),
        dig(record, "tokens", "refresh_token"),
        dig(record, "token", "refreshToken"),
        dig(record, "token", "refresh_token"),
        dig(record, "credentials", "refresh_token"),
    )
    input_id_token = first_non_empty(
        record.get("idToken"),
        record.get("id_token"),
        dig(record, "tokens", "idToken"),
        dig(record, "tokens", "id_token"),
        dig(record, "token", "idToken"),
        dig(record, "token", "id_token"),
        dig(record, "credentials", "id_token"),
    )

    payload = parse_jwt_payload(access_token)
    id_payload = parse_jwt_payload(input_id_token)
    auth = get_openai_auth_section(payload)
    id_auth = get_openai_auth_section(id_payload)
    has_refresh_token = bool(refresh_token)
    expires_at = None if has_refresh_token else first_non_empty(
        timestamp_from_unix_seconds(payload.get("exp")) if payload is not None else None,
        normalize_timestamp(record.get("expires")),
        normalize_timestamp(record.get("expiresAt")),
        normalize_timestamp(record.get("expired")),
        normalize_timestamp(record.get("expires_at")),
    )
    email = first_non_empty(
        dig(record, "user", "email"),
        record.get("email"),
        dig(record, "meta", "label"),
        record.get("label"),
        dig(record, "credentials", "email"),
        dig(record, "providerSpecificData", "email"),
        payload.get("email") if payload is not None else None,
        id_payload.get("email") if id_payload is not None else None,
    )
    account_id = first_non_empty(
        dig(record, "account", "id"),
        record.get("account_id"),
        dig(record, "tokens", "accountId"),
        dig(record, "tokens", "account_id"),
        record.get("chatgptAccountId"),
        record.get("chatgpt_account_id"),
        dig(record, "meta", "chatgptAccountId"),
        dig(record, "meta", "chatgpt_account_id"),
        dig(record, "tokens", "chatgptAccountId"),
        dig(record, "tokens", "chatgpt_account_id"),
        dig(record, "providerSpecificData", "chatgptAccountId"),
        dig(record, "providerSpecificData", "chatgpt_account_id"),
        dig(record, "credentials", "chatgpt_account_id"),
        auth.get("chatgpt_account_id"),
        id_auth.get("chatgpt_account_id"),
        record.get("id") if record.get("provider") == "codex" else None,
    )
    user_id = first_non_empty(
        dig(record, "user", "id"),
        record.get("user_id"),
        record.get("chatgptUserId"),
        dig(record, "providerSpecificData", "chatgptUserId"),
        dig(record, "providerSpecificData", "chatgpt_user_id"),
        auth.get("chatgpt_user_id"),
        auth.get("user_id"),
        id_auth.get("chatgpt_user_id"),
        id_auth.get("user_id"),
    )
    plan_type = first_non_empty(
        dig(record, "account", "planType"),
        dig(record, "account", "plan_type"),
        record.get("planType"),
        record.get("plan_type"),
        dig(record, "providerSpecificData", "chatgptPlanType"),
        dig(record, "providerSpecificData", "chatgpt_plan_type"),
        dig(record, "credentials", "plan_type"),
        auth.get("chatgpt_plan_type"),
        id_auth.get("chatgpt_plan_type"),
    )

    exported_at = normalize_timestamp(options.get("now") or datetime.now(timezone.utc))
    synthetic_id_token = None if input_id_token else build_synthetic_codex_id_token(
        email, account_id, plan_type, user_id, expires_at
    )
    id_token = first_non_empty(input_id_token, synthetic_id_token)

    return {
        "auth_mode": "chatgpt",
        "OPENAI_API_KEY": None,
        "tokens": {
            "id_token": id_token,
            "access_token": access_token,
            "refresh_token": refresh_token or "",
            "account_id": account_id,
        },
        "last_refresh": exported_at,
    }


def print_help(stream=sys.stdout):
    stream.write("Usage:\n")
    stream.write("  python codex-auth.py <input.json> [-o auth.json]\n")
    stream.write("  cat input.json | python codex-auth.py [-o auth.json]\n")
    stream.write("  python codex-auth.py --help\n\n")
    stream.write("Converts JSON from various sources into the native Codex auth.json format.\n")
    stream.write("A single account is emitted as an object; multiple accounts as an array.\n")


def main(argv):
    if "-h" in argv or "--help" in argv:
        print_help()
        return 0

    file_arg = next((arg for arg in argv if not arg.startswith("-")), None)
    out_file = None
    if "-o" in argv:
        out_idx = argv.index("-o")
        out_file = argv[out_idx + 1] if out_idx + 1 < len(argv) else None

    if file_arg:
        with open(file_arg, "r", encoding="utf-8") as handle:
            text = handle.read()
    elif not sys.stdin.isatty():
        text = sys.stdin.read()
    else:
        print_help(sys.stderr)
        return 1

    try:
        docs = parse_input_documents(text)
    except ValueError as error:
        sys.stderr.write("%s\n" % error)
        return 1

    if not docs:
        sys.stderr.write("No convertible account found (accessToken and an identity field are required).\n")
        return 2

    converted = [to_codex_auth(doc["value"]) for doc in docs]
    result = converted[0] if len(converted) == 1 else converted
    json_str = json.dumps(result, indent=2, ensure_ascii=False)

    if out_file:
        with open(out_file, "w", encoding="utf-8") as handle:
            handle.write(json_str + "\n")
        sys.stderr.write("Wrote %s (%d accounts)\n" % (out_file, len(converted)))
    else:
        sys.stdout.buffer.write(json_str.encode("utf-8"))
        sys.stdout.buffer.write(b"\n")
    return 0


if __name__ == "__main__":
    try:
        _rc = main(sys.argv[1:])
    except Exception as error:
        sys.stderr.write("%s\n" % (error.message if hasattr(error, "message") else error))
        sys.exit(1)
    sys.exit(_rc)
