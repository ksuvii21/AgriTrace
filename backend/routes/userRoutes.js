// routes/userRoutes.js
import express from "express";
import { getCurrentUser } from "../core/deps.js";
import {
  registerPushToken,
  removePushToken,
} from "../services/pushTokenService.js";
import { success, error } from "../utils/apiResponse.js";

const router = express.Router();

// ==========================================================
// PUSH TOKEN STORAGE
// ==========================================================
//
// Contract expected by the mobile app:
//   POST   /api/v1/users/push-token
//   DELETE /api/v1/users/push-token
//
// Tokens are stored against the authenticated user (req.user.uid).

router.post("/push-token", getCurrentUser, async (req, res) => {
  try {
    const entry = await registerPushToken(req.user.uid, req.body || {});
    return success(
      res,
      { token: entry.token, platform: entry.platform, deviceId: entry.deviceId },
      "Push token registered"
    );
  } catch (e) {
    if (e.code === "INVALID_PUSH_TOKEN") {
      return error(res, 400, "A valid push token is required");
    }
    if (e.code === "USER_NOT_FOUND") {
      return error(res, 404, "User profile not found");
    }
    console.error("Register push token error:", e);
    return error(res, 500, "Failed to register push token");
  }
});

router.delete("/push-token", getCurrentUser, async (req, res) => {
  try {
    const result = await removePushToken(req.user.uid, req.body || {});
    return success(res, result, "Push token removed");
  } catch (e) {
    if (e.code === "USER_NOT_FOUND") {
      return error(res, 404, "User profile not found");
    }
    console.error("Remove push token error:", e);
    return error(res, 500, "Failed to remove push token");
  }
});

export default router;