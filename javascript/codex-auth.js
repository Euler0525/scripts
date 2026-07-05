"use strict";

// Converts JSON auth/session documents from a variety of sources into the
// native Codex auth.json format. A single account is emitted as an object;
// multiple accounts are emitted as an array.

const fs = require("node:fs");

// Returns true when value is a non-null plain object (not an array).
function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

// Returns the first argument that trims to a non-empty string, else undefined.
function firstNonEmpty(...values) {
    for (const value of values) {
        if (typeof value === "string" && value.trim() !== "") {
            return value.trim();
        }
    }
    return undefined;
}

function decodeBase64Url(value) {
    return Buffer.from(value, "base64url").toString("utf8");
}

function encodeBase64UrlJson(value) {
    return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function parseJwtPayload(token) {
    if (typeof token !== "string" || token.trim() === "") {
        return undefined;
    }

    const segments = token.split(".");
    if (segments.length < 2) {
        return undefined;
    }

    try {
        return JSON.parse(decodeBase64Url(segments[1]));
    } catch {
        return undefined;
    }
}

function getOpenAIAuthSection(payload) {
    if (!isPlainObject(payload)) {
        return {};
    }

    const auth = payload["https://api.openai.com/auth"];
    return isPlainObject(auth) ? auth : {};
}

// Normalizes a Date, number, or date string into an ISO-8601 string.
// Numeric values are treated as milliseconds, unless they look like seconds
// (smaller than 1e11), in which case they are multiplied by 1000.
function normalizeTimestamp(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value.toISOString();
    }

    if (typeof value === "number" && Number.isFinite(value)) {
        const milliseconds = value > 1e11 ? value : value * 1000;
        const date = new Date(milliseconds);
        return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
    }

    if (typeof value !== "string" || value.trim() === "") {
        return undefined;
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function timestampFromUnixSeconds(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return undefined;
    }

    const date = new Date(numeric * 1000);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

// Converts a value into whole Unix seconds. Numeric values above 1e11 are
// treated as milliseconds and divided by 1000. Unparseable input yields 0.
function epochSecondsFromValue(value) {
    if (value === undefined || value === null || value === "") {
        return 0;
    }

    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
        return Math.trunc(numeric > 1e11 ? numeric / 1000 : numeric);
    }

    const parsed = Date.parse(String(value));
    return Number.isFinite(parsed) ? Math.trunc(parsed / 1000) : 0;
}

// Builds a signed-looking (alg: none) synthetic id_token when the source
// document did not provide one, so Codex still receives the account metadata.
function buildSyntheticCodexIdToken(email, accountId, planType, userId, expiresAt) {
    if (!accountId) {
        return undefined;
    }

    const now = Math.trunc(Date.now() / 1000);
    const authInfo = { chatgpt_account_id: accountId };
    const expires = epochSecondsFromValue(expiresAt) || now + 90 * 24 * 60 * 60;

    if (planType) {
        authInfo.chatgpt_plan_type = planType;
    }

    if (userId) {
        authInfo.chatgpt_user_id = userId;
        authInfo.user_id = userId;
    }

    const payload = {
        iat: now,
        exp: expires,
        "https://api.openai.com/auth": authInfo,
    };

    if (email) {
        payload.email = email;
    }

    return `${encodeBase64UrlJson({ alg: "none", typ: "JWT", cpa_synthetic: true })}.${encodeBase64UrlJson(payload)}.synthetic`;
}

// Recursively walks a parsed JSON value and collects every object that looks
// like a session: it carries an access token plus at least one identity field.
function collectSessionLikeObjects(value, sourceName = "pasted-json") {
    const found = [];
    const visited = new WeakSet();

    function visit(item, path) {
        if (!isPlainObject(item) && !Array.isArray(item)) {
            return;
        }

        if (isPlainObject(item)) {
            if (visited.has(item)) {
                return;
            }
            visited.add(item);

            const token = firstNonEmpty(
                item.accessToken,
                item.access_token,
                item.tokens?.accessToken,
                item.tokens?.access_token,
                item.token?.accessToken,
                item.token?.access_token,
                item.credentials?.accessToken,
                item.credentials?.access_token,
            );
            const hasIdentity = isPlainObject(item.user) || firstNonEmpty(
                item.email,
                item.name,
                item.label,
                item.meta?.label,
                item.tokens?.accountId,
                item.tokens?.account_id,
                item.tokens?.chatgptAccountId,
                item.tokens?.chatgpt_account_id,
                item.providerSpecificData?.chatgptAccountId,
                item.providerSpecificData?.chatgpt_account_id,
                item.id,
            );
            if (token && hasIdentity) {
                found.push({ value: item, sourceName, path });
                return;
            }

            for (const [key, child] of Object.entries(item)) {
                if (key === "accessToken" || key === "access_token" || key === "sessionToken") {
                    continue;
                }
                visit(child, `${path}.${key}`);
            }
            return;
        }

        item.forEach((child, index) => visit(child, `${path}[${index}]`));
    }

    visit(value, "$");
    return found;
}

function parseInputDocuments(text) {
    if (typeof text !== "string" || text.trim() === "") {
        return [];
    }

    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch (error) {
        throw new Error(`JSON parsing failed: ${error.message}`);
    }

    return collectSessionLikeObjects(parsed);
}

// Core conversion: a single session record -> Codex auth.json object.
function toCodexAuth(record, options = {}) {
    if (!isPlainObject(record)) {
        throw new Error("session is not a JSON object");
    }

    const accessToken = firstNonEmpty(
        record.accessToken,
        record.access_token,
        record.tokens?.accessToken,
        record.tokens?.access_token,
        record.token?.accessToken,
        record.token?.access_token,
        record.credentials?.accessToken,
        record.credentials?.access_token,
    );
    if (!accessToken) {
        throw new Error("accessToken is missing");
    }
    const refreshToken = firstNonEmpty(
        record.refreshToken,
        record.refresh_token,
        record.tokens?.refreshToken,
        record.tokens?.refresh_token,
        record.token?.refreshToken,
        record.token?.refresh_token,
        record.credentials?.refresh_token,
    );
    const inputIdToken = firstNonEmpty(
        record.idToken,
        record.id_token,
        record.tokens?.idToken,
        record.tokens?.id_token,
        record.token?.idToken,
        record.token?.id_token,
        record.credentials?.id_token,
    );

    const payload = parseJwtPayload(accessToken);
    const idPayload = parseJwtPayload(inputIdToken);
    const auth = getOpenAIAuthSection(payload);
    const idAuth = getOpenAIAuthSection(idPayload);
    const hasRefreshToken = Boolean(refreshToken);
    const expiresAt = hasRefreshToken ? undefined : firstNonEmpty(
        payload ? timestampFromUnixSeconds(payload.exp) : undefined,
        normalizeTimestamp(record.expires),
        normalizeTimestamp(record.expiresAt),
        normalizeTimestamp(record.expired),
        normalizeTimestamp(record.expires_at),
    );
    const email = firstNonEmpty(
        record.user?.email,
        record.email,
        record.meta?.label,
        record.label,
        record.credentials?.email,
        record.providerSpecificData?.email,
        payload?.email,
        idPayload?.email,
    );
    const accountId = firstNonEmpty(
        record.account?.id,
        record.account_id,
        record.tokens?.accountId,
        record.tokens?.account_id,
        record.chatgptAccountId,
        record.chatgpt_account_id,
        record.meta?.chatgptAccountId,
        record.meta?.chatgpt_account_id,
        record.tokens?.chatgptAccountId,
        record.tokens?.chatgpt_account_id,
        record.providerSpecificData?.chatgptAccountId,
        record.providerSpecificData?.chatgpt_account_id,
        record.credentials?.chatgpt_account_id,
        auth.chatgpt_account_id,
        idAuth.chatgpt_account_id,
        record.provider === "codex" ? record.id : undefined,
    );
    const userId = firstNonEmpty(
        record.user?.id,
        record.user_id,
        record.chatgptUserId,
        record.providerSpecificData?.chatgptUserId,
        record.providerSpecificData?.chatgpt_user_id,
        auth.chatgpt_user_id,
        auth.user_id,
        idAuth.chatgpt_user_id,
        idAuth.user_id,
    );
    const planType = firstNonEmpty(
        record.account?.planType,
        record.account?.plan_type,
        record.planType,
        record.plan_type,
        record.providerSpecificData?.chatgptPlanType,
        record.providerSpecificData?.chatgpt_plan_type,
        record.credentials?.plan_type,
        auth.chatgpt_plan_type,
        idAuth.chatgpt_plan_type,
    );

    const exportedAt = normalizeTimestamp(options.now || new Date());
    const syntheticIdToken = !inputIdToken
        ? buildSyntheticCodexIdToken(email, accountId, planType, userId, expiresAt)
        : undefined;
    const idToken = firstNonEmpty(inputIdToken, syntheticIdToken);

    return {
        auth_mode: "chatgpt",
        OPENAI_API_KEY: null,
        tokens: {
            id_token: idToken,
            access_token: accessToken,
            refresh_token: refreshToken || "",
            account_id: accountId,
        },
        last_refresh: exportedAt,
    };
}

function readStdin() {
    return new Promise((resolve, reject) => {
        const chunks = [];
        process.stdin.setEncoding("utf8");
        process.stdin.on("data", (chunk) => chunks.push(chunk));
        process.stdin.on("end", () => resolve(chunks.join("")));
        process.stdin.on("error", reject);
    });
}

function printHelp() {
    console.log(`Usage:
  node codex-auth.js <input.json> [-o auth.json]
  cat input.json | node codex-auth.js [-o auth.json]
  node codex-auth.js --help

Converts JSON from various sources into the native Codex auth.json format.
A single account is emitted as an object; multiple accounts as an array.`);
}

async function main(argv) {
    if (argv.includes("-h") || argv.includes("--help")) {
        printHelp();
        return;
    }

    const fileArg = argv.find((arg) => !arg.startsWith("-"));
    const outIdx = argv.indexOf("-o");
    const outFile = outIdx !== -1 ? argv[outIdx + 1] : undefined;

    let text;
    if (fileArg) {
        text = fs.readFileSync(fileArg, "utf8");
    } else if (!process.stdin.isTTY) {
        text = await readStdin();
    } else {
        printHelp();
        process.exit(1);
    }

    const docs = parseInputDocuments(text);
    if (docs.length === 0) {
        console.error("No convertible account found (accessToken and an identity field are required).");
        process.exit(2);
    }

    const converted = docs.map((doc) => toCodexAuth(doc.value));
    const result = converted.length === 1 ? converted[0] : converted;
    const json = JSON.stringify(result, null, 2);

    if (outFile) {
        fs.writeFileSync(outFile, json + "\n", "utf8");
        console.error(`Wrote ${outFile} (${converted.length} accounts)`);
    } else {
        console.log(json);
    }
}

if (require.main === module) {
    main(process.argv.slice(2)).catch((error) => {
        console.error(error.message || error);
        process.exit(1);
    });
}

module.exports = { toCodexAuth, parseInputDocuments, collectSessionLikeObjects };
