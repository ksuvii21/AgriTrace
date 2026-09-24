// ============================================================
// END-TO-END VERIFICATION: Critical Alert flow
// ============================================================
//
// Exercises the REAL backend services against MongoDB:
//   telemetry -> shipment association -> alert creation
//   -> deduplication -> acknowledge
//
// Push delivery is verified structurally (payload builder) because CI has no
// device registration tokens. MQTT transport itself is covered by the
// existing mqtt-e2e test; here we drive the same functions MQTT calls.
//
// Run:  node scripts/verify-critical-alert.js
// ============================================================

import "dotenv/config";
import { randomUUID } from "crypto";
import { connectMongo, getCollection, getTelemetryCollection } from "../core/mongo.js";
import { normalizeTelemetry } from "../models/telemetry.js";
import { evaluateAlerts, acknowledgeAlert, getAlertById, triggerTestCriticalAlert } from "../services/alertService.js";
import { getLatestTelemetryByShipmentDevices } from "../services/telemetryService.js";
import { buildCriticalAlertNotification, CRITICAL_CHANNEL_ID } from "../core/pushNotifications.js";
import { registerPushToken, removePushToken, getPushTokensForUids } from "../services/pushTokenService.js";
import { config } from "../core/config.js";

const DEVICE_ID = `VERIFY-DEV-${Date.now()}`;
const SHIPMENT_ID = randomUUID();
const OWNER_UID = `verify-owner-${Date.now()}`;
const GAS_VALUE = 4127;

let pass = 0;
let fail = 0;

function check(label, condition, detail = "") {
  if (condition) {
    pass += 1;
    console.log(`  PASS  ${label}`);
  } else {
    fail += 1;
    console.error(`  FAIL  ${label}${detail ? ` -> ${detail}` : ""}`);
  }
}

async function cleanup() {
  await getTelemetryCollection().deleteMany({ deviceId: DEVICE_ID });
  await getCollection("devices").deleteOne({ deviceId: DEVICE_ID });
  await getCollection("shipments").deleteOne({ shipmentId: SHIPMENT_ID });
  await getCollection("alerts").deleteMany({ deviceId: DEVICE_ID });
  await getCollection("timeline").deleteMany({ shipmentId: SHIPMENT_ID });
  await getCollection("users").deleteOne({ uid: OWNER_UID });
}

async function main() {
  console.log("\n=== AgriTrace Critical Alert E2E ===\n");
  console.log(`CRITICAL_GAS_THRESHOLD = ${config.criticalGasThreshold}`);
  console.log(`Gas test value          = ${GAS_VALUE}\n`);

  await connectMongo();
  await cleanup();

  // Seed a device assigned to a shipment (mirrors deviceService.assignDevice).
  await getCollection("devices").insertOne({
    deviceId: DEVICE_ID,
    serialNumber: DEVICE_ID,
    ownerId: OWNER_UID,
    status: "ONLINE",
    battery: 88,
    currentShipmentId: SHIPMENT_ID,
    createdAt: new Date().toISOString(),
  });

  await getCollection("shipments").insertOne({
    shipmentId: SHIPMENT_ID,
    trackingId: `VERIFY-${Date.now()}`,
    name: "Verification Shipment",
    createdBy: OWNER_UID,
    farmerId: OWNER_UID,
    assignedDevice: DEVICE_ID,
    status: "IN_TRANSIT",
    thresholds: { gasLevel: { max: 100 } },
    createdAt: new Date().toISOString(),
  });

  // --- Step 1: telemetry association -------------------------------------
  console.log("1. Telemetry -> shipment association");
  const receivedAt = new Date();
  let sequence = 100000;
  const readings = [];

  for (const gasLevel of [4100, 4200, 4050, 4300]) {
    sequence += 1;
    const normalized = normalizeTelemetry(
      {
        deviceId: DEVICE_ID,
        sequenceNumber: sequence,
        temperature: 22,
        humidity: 60,
        battery: 88,
        gasLevel,
      },
      DEVICE_ID,
      SHIPMENT_ID,
      receivedAt
    );

    await getTelemetryCollection().insertOne({
      ...normalized,
      timestamp: new Date(normalized.timestamp),
      receivedAt,
    });

    readings.push(normalized);
    await evaluateAlerts(normalized, { thresholds: { gasLevel: { max: 100 } } });
  }

  const shipmentTelemetry = await getLatestTelemetryByShipmentDevices(SHIPMENT_ID);
  check(
    "telemetry latest by shipment returns the device reading",
    shipmentTelemetry.length === 1 && shipmentTelemetry[0].deviceId === DEVICE_ID,
    JSON.stringify(shipmentTelemetry.map((t) => t.deviceId))
  );
  check(
    "telemetry is stamped with the shipmentId",
    shipmentTelemetry[0]?.shipmentId === SHIPMENT_ID,
    String(shipmentTelemetry[0]?.shipmentId)
  );

  // --- Step 2: alert deduplication ---------------------------------------
  console.log("\n2. Alert deduplication");
  const gasAlerts = await getCollection("alerts")
    .find({ deviceId: DEVICE_ID, type: "GAS_CRITICAL" })
    .toArray();

  check("exactly ONE GAS_CRITICAL incident exists", gasAlerts.length === 1, `found ${gasAlerts.length}`);

  const incident = gasAlerts[0];
  check("incident status is OPEN", incident.status === "OPEN", incident.status);
  check("occurrenceCount reflects 4 readings", incident.occurrenceCount === 4, String(incident.occurrenceCount));
  check("latestGasLevel is the newest raw value", incident.latestGasLevel === 4300, String(incident.latestGasLevel));
  check("lastTriggeredAt is set", Boolean(incident.lastTriggeredAt));
  check(
    "threshold resolved from shipment override",
    incident.threshold?.limit === 100,
    String(incident.threshold?.limit)
  );

  // --- Step 3: push payload structure ------------------------------------
  console.log("\n3. Push notification payload");
  const payload = buildCriticalAlertNotification({
    alert: incident,
    deviceId: DEVICE_ID,
    shipmentId: SHIPMENT_ID,
    gasLevel: GAS_VALUE,
  });

  check("title is the critical alert title", payload.title === "🚨 AgriTrace Critical Alert", payload.title);
  check("body contains device", payload.body.includes(`Device: ${DEVICE_ID}`));
  check("body contains gas level", payload.body.includes(`Gas Level: ${GAS_VALUE}`));
  check("data.type is GAS_CRITICAL", payload.data.type === "GAS_CRITICAL");
  check("data.alertId present", payload.data.alertId === incident.alertId);
  check("data.deviceId present", payload.data.deviceId === DEVICE_ID);
  check("data.shipmentId present", payload.data.shipmentId === SHIPMENT_ID);
  check("channelId is agritrace-critical-alerts", CRITICAL_CHANNEL_ID === "agritrace-critical-alerts");

  // --- Step 4: acknowledgement -------------------------------------------
  console.log("\n4. Acknowledgement");
  const acked = await acknowledgeAlert(incident.alertId, OWNER_UID);
  check("status is ACKNOWLEDGED", acked.status === "ACKNOWLEDGED", acked.status);
  check("acknowledgedAt is set", Boolean(acked.acknowledgedAt));
  check("acknowledgedBy is the acting user", acked.acknowledgedBy === OWNER_UID);

  const stillThere = await getAlertById(incident.alertId);
  check("alert is NOT deleted after acknowledge", Boolean(stillThere));

  // A new breach after acknowledgement starts a NEW incident (dedup does not
  // silently swallow a fresh critical event).
  sequence += 1;
  const reopen = normalizeTelemetry(
    {
      deviceId: DEVICE_ID,
      sequenceNumber: sequence,
      temperature: 22,
      humidity: 60,
      battery: 88,
      gasLevel: 4200,
    },
    DEVICE_ID,
    SHIPMENT_ID,
    receivedAt
  );
  await getTelemetryCollection().insertOne({
    ...reopen,
    timestamp: new Date(reopen.timestamp),
    receivedAt,
  });
  await evaluateAlerts(reopen, { thresholds: { gasLevel: { max: 100 } } });

  const afterAck = await getCollection("alerts")
    .find({ deviceId: DEVICE_ID, type: "GAS_CRITICAL" })
    .toArray();
  check("new breach after ack creates a fresh OPEN incident", afterAck.length === 1 && afterAck[0].status === "OPEN", JSON.stringify(afterAck.map((a) => a.status)));

  // --- Step 5: push token storage ----------------------------------------
  console.log("\n5. Push token storage");
  await getCollection("users").insertOne({
    uid: OWNER_UID,
    email: `${OWNER_UID}@verify.local`,
    role: "FARMER",
    createdAt: new Date().toISOString(),
  });

  const registered = await registerPushToken(OWNER_UID, {
    fcmToken: "dummy-registration-token-abcdefghijklmnop",
    platform: "android",
    deviceId: "verify-android",
  });
  check("fcmToken field is accepted", registered.token === "dummy-registration-token-abcdefghijklmnop");

  // A second client variant the mobile app may send.
  await registerPushToken(OWNER_UID, {
    pushToken: "second-registration-token-abcdefghijklmnop",
    platform: "ios",
  });

  const tokensForUser = await getPushTokensForUids([OWNER_UID]);
  check("both tokens stored for the user", tokensForUser.length === 2, JSON.stringify(tokensForUser));

  const removed = await removePushToken(OWNER_UID, {
    token: "dummy-registration-token-abcdefghijklmnop",
  });
  const remaining = await getPushTokensForUids([OWNER_UID]);
  check("single-token DELETE removes one token", removed.remaining === 1 && remaining.length === 1, JSON.stringify(remaining));

  await removePushToken(OWNER_UID, {});
  const cleared = await getPushTokensForUids([OWNER_UID]);
  check("token-less DELETE clears all tokens", cleared.length === 0);

  // --- Step 6: test-critical endpoint uses the real pipeline -------------
  console.log("\n6. /alerts/test-critical pipeline reuse");
  const before = await getCollection("alerts")
    .find({ deviceId: DEVICE_ID, type: "GAS_CRITICAL", status: "OPEN" })
    .toArray();

  const testResult = await triggerTestCriticalAlert({
    deviceId: DEVICE_ID,
    gasLevel: GAS_VALUE,
  });

  check("test-critical resolves the device's shipment", testResult.shipmentId === SHIPMENT_ID, String(testResult.shipmentId));
  check("test-critical created a real GAS_CRITICAL incident", testResult.alert?.type === "GAS_CRITICAL");
  check(
    "test-critical deduped onto the existing OPEN incident",
    testResult.alert?.alertId === before[0]?.alertId && testResult.alert?.occurrenceCount > before[0]?.occurrenceCount,
    `${testResult.alert?.occurrenceCount} vs ${before[0]?.occurrenceCount}`
  );

  console.log(`\n=== ${pass} passed, ${fail} failed ===\n`);

  await cleanup();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error("E2E error:", error);
  try {
    await cleanup();
  } catch {}
  process.exit(1);
});