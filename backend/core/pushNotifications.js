import { messaging } from "./firebase.js";
import { config } from "./config.js";
import { getCollection } from "./mongo.js";
import {
  getPushTokensForUids,
  prunePushToken,
} from "../services/pushTokenService.js";

// ==========================================================
// PUSH NOTIFICATIONS (Firebase Cloud Messaging)
// ==========================================================
//
// Delivery originates from the backend when a NEW critical alert is created,
// so it does not depend on LiveMonitoringScreen being mounted.

export const CRITICAL_CHANNEL_ID = "agritrace-critical-alerts";

// Resolve the authenticated users associated with a shipment: the farmer who
// created it plus any assigned transporter / warehouse / retailer.
export async function resolveShipmentRecipientUids(shipmentId) {
  if (!shipmentId) return [];

  const shipment = await getCollection("shipments").findOne({ shipmentId });
  if (!shipment) return [];

  const uids = new Set();
  for (const field of [
    "createdBy",
    "farmerId",
    "transporterId",
    "warehouseId",
    "retailerId",
  ]) {
    if (shipment[field]) uids.add(shipment[field]);
  }

  return [...uids];
}

export function buildCriticalAlertNotification({ alert, deviceId, shipmentId, gasLevel }) {
  return {
    title: "🚨 AgriTrace Critical Alert",
    body:
      "Critical gas response detected\n" +
      `Device: ${deviceId}\n` +
      `Gas Level: ${gasLevel}\n` +
      "Immediate inspection required.",
    data: {
      alertId: String(alert.alertId),
      deviceId: String(deviceId),
      shipmentId: String(shipmentId || ""),
      type: "GAS_CRITICAL",
    },
  };
}

// Send a high-priority critical alert push to every authenticated user
// associated with the shipment. Best-effort: never throws to the caller.
export async function sendCriticalAlertPush({
  alert,
  deviceId,
  shipmentId,
  gasLevel,
  recipientUids = null,
}) {
  if (!config.pushNotificationsEnabled) {
    console.log(
      `[Push] Skipped critical alert push for ${alert?.alertId}: PUSH_NOTIFICATIONS_ENABLED is not true`
    );
    return { sent: 0, failed: 0, skipped: true };
  }

  if (!messaging) {
    console.warn(
      `[Push] Skipped critical alert push for ${alert?.alertId}: Firebase Messaging unavailable`
    );
    return { sent: 0, failed: 0, skipped: true };
  }

  const uids =
    Array.isArray(recipientUids) && recipientUids.length > 0
      ? recipientUids
      : await resolveShipmentRecipientUids(shipmentId);

  const tokens = await getPushTokensForUids(uids);

  if (tokens.length === 0) {
    console.log(
      `[Push] No push tokens for critical alert ${alert?.alertId}` +
      (shipmentId ? ` (shipment ${shipmentId})` : "")
    );
    return { sent: 0, failed: 0, skipped: true };
  }

  const { title, body, data } = buildCriticalAlertNotification({
    alert,
    deviceId,
    shipmentId,
    gasLevel,
  });

  const message = {
    tokens,
    notification: { title, body },
    data,
    android: {
      priority: "high",
      notification: {
        channelId: CRITICAL_CHANNEL_ID,
        sound: "default",
        priority: "max",
        defaultSound: true,
        defaultVibrateTimings: true,
        visibility: "public",
      },
    },
    apns: {
      headers: {
        "apns-priority": "10",
      },
      payload: {
        aps: {
          sound: "default",
          contentAvailable: true,
          "interruption-level": "critical",
        },
      },
    },
  };

  try {
    const response = await messaging.sendEachForMulticast(message);

    const invalidTokens = [];
    response.responses.forEach((result, index) => {
      if (result.success) return;
      const code = result.error?.code || "";
      if (
        code === "messaging/registration-token-not-registered" ||
        code === "messaging/invalid-registration-token" ||
        code === "messaging/invalid-argument"
      ) {
        invalidTokens.push(tokens[index]);
      }
    });

    for (const token of invalidTokens) {
      await prunePushToken(token);
    }

    console.log(
      `[Push] Critical alert ${alert?.alertId} -> ${response.successCount} sent, ${response.failureCount} failed`
    );

    return {
      sent: response.successCount,
      failed: response.failureCount,
      skipped: false,
    };
  } catch (error) {
    console.error(
      `[Push] Critical alert push failed for ${alert?.alertId}:`,
      error.message
    );
    return { sent: 0, failed: tokens.length, skipped: false, error: error.message };
  }
}