import { getCollection } from "../core/mongo.js";

// ==========================================================
// PUSH TOKEN STORAGE
// ==========================================================
//
// Tokens are stored on the authenticated user document under `pushTokens`
// so notification delivery is bound to the user, not to a device record.
// Each entry keeps the token plus optional metadata the mobile client sends.
//
// Shape of each stored entry:
//   {
//     token,
//     platform,        // "ios" | "android" | "web" | null
//     deviceId,        // optional, informational
//     createdAt,
//     updatedAt,
//   }

const MAX_TOKENS_PER_USER = 20;

function normalizeToken(value) {
  if (typeof value !== "string") return null;
  const token = value.trim();
  if (!token) return null;
  // FCM registration tokens are opaque, but reject obvious junk.
  if (token.length < 20 || token.length > 4096) return null;
  return token;
}

function normalizePlatform(value) {
  if (typeof value !== "string") return null;
  const platform = value.trim().toLowerCase();
  if (!platform) return null;
  if (["ios", "android", "web"].includes(platform)) return platform;
  return null;
}

// Extract the token from every field name the mobile client is known to send.
export function extractPushToken(body = {}) {
  const candidates = [
    body.token,
    body.pushToken,
    body.fcmToken,
    body.fcm_token,
    body.registrationToken,
    body.registration_token,
    body.deviceToken,
    body.device_token,
  ];

  for (const candidate of candidates) {
    const token = normalizeToken(candidate);
    if (token) return token;
  }

  return null;
}

export async function registerPushToken(uid, body = {}) {
  const token = extractPushToken(body);

  if (!token) {
    const error = new Error("A valid push token is required");
    error.code = "INVALID_PUSH_TOKEN";
    throw error;
  }

  const platform =
    normalizePlatform(body.platform) ||
    normalizePlatform(body.deviceType) ||
    normalizePlatform(body.os);

  const deviceId =
    typeof body.deviceId === "string" && body.deviceId.trim()
      ? body.deviceId.trim()
      : null;

  const users = getCollection("users");
  const now = new Date().toISOString();

  const user = await users.findOne({ uid });
  if (!user) {
    const error = new Error("User profile not found");
    error.code = "USER_NOT_FOUND";
    throw error;
  }

  const existing = Array.isArray(user.pushTokens) ? user.pushTokens : [];
  const remaining = existing.filter((entry) => entry?.token !== token);

  const entry = {
    token,
    platform: platform || null,
    deviceId,
    createdAt:
      existing.find((item) => item?.token === token)?.createdAt || now,
    updatedAt: now,
  };

  const nextTokens = [...remaining, entry].slice(-MAX_TOKENS_PER_USER);

  await users.updateOne(
    { uid },
    {
      $set: {
        pushTokens: nextTokens,
        // Convenience mirror of the most recently registered token.
        lastPushToken: token,
        pushTokenUpdatedAt: now,
        updatedAt: now,
      },
    }
  );

  return entry;
}

export async function removePushToken(uid, body = {}) {
  const token = extractPushToken(body);
  const users = getCollection("users");
  const now = new Date().toISOString();

  const user = await users.findOne({ uid });
  if (!user) {
    const error = new Error("User profile not found");
    error.code = "USER_NOT_FOUND";
    throw error;
  }

  const existing = Array.isArray(user.pushTokens) ? user.pushTokens : [];

  // A DELETE without a token body clears all tokens for the user (logout /
  // "disable notifications"). A DELETE with a token removes just that one.
  const nextTokens = token ? existing.filter((entry) => entry?.token !== token) : [];

  const update = {
    pushTokens: nextTokens,
    pushTokenUpdatedAt: now,
    updatedAt: now,
  };

  // Only clear the mirrored field when the removed token was the mirror.
  if (!token || user.lastPushToken === token) {
    update.lastPushToken = nextTokens[nextTokens.length - 1]?.token || null;
  }

  await users.updateOne({ uid }, { $set: update });

  return { removed: token || "ALL", remaining: nextTokens.length };
}

export async function getPushTokensForUids(uids = []) {
  if (!Array.isArray(uids) || uids.length === 0) return [];

  const users = await getCollection("users")
    .find(
      { uid: { $in: uids } },
      { projection: { _id: 0, uid: 1, pushTokens: 1, lastPushToken: 1 } }
    )
    .toArray();

  const tokens = new Set();

  for (const user of users) {
    if (Array.isArray(user.pushTokens)) {
      for (const entry of user.pushTokens) {
        if (entry?.token) tokens.add(entry.token);
      }
    }
    if (user.lastPushToken) tokens.add(user.lastPushToken);
  }

  return [...tokens];
}

// Called when FCM reports a token as permanently invalid so we stop sending
// to it. Best-effort: never throws to the caller.
export async function prunePushToken(token) {
  if (!token) return;
  try {
    const users = getCollection("users");
    await users.updateMany(
      { "pushTokens.token": token },
      {
        $pull: { pushTokens: { token } },
      }
    );
    await users.updateMany(
      { lastPushToken: token },
      { $set: { lastPushToken: null } }
    );
  } catch (error) {
    console.warn(`[Push] Failed pruning token: ${error.message}`);
  }
}