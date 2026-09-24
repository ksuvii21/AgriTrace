import { getCollection } from "../core/mongo.js";
import { broadcastToAll } from "../core/websocket.js";
import { TimelineEventType } from "../core/timelineEvents.js";
import { addTimelineEvent } from "./timelineService.js";
import { getAccessibleShipmentIds, getAccessibleDeviceIds } from "../core/accessControl.js";
import { config } from "../core/config.js";
import { sendCriticalAlertPush } from "../core/pushNotifications.js";

export async function createSystemAlert({
  deviceId,
  shipmentId,
  type,
  severity,
  value,
}) {
  const existing = await getCollection("alerts").findOne({
    deviceId,
    type,
    status: "OPEN",
  });

  if (existing) {
    return existing;
  }

  const alertId = `${deviceId}_${type}_${Date.now()}`;
  const now = new Date().toISOString();
  const alert = {
    alertId,
    deviceId,
    shipmentId,
    type,
    severity,
    value,
    timestamp: now,
    createdAt: now,
    status: "OPEN",
    acknowledgedAt: null,
    resolvedAt: null,
  };

  await getCollection("alerts").insertOne(alert);
  return alert;
}

export async function resolveSystemAlert(deviceId, type, actorId = "SYSTEM") {
  const now = new Date().toISOString();
  const result = await getCollection("alerts").findOneAndUpdate(
    { deviceId, type, status: "OPEN" },
    { $set: { status: "RESOLVED", resolvedAt: now, resolvedBy: actorId } },
    { sort: { createdAt: 1 }, returnDocument: "after" }
  );

  if (!result) return null;
  return { ...result, id: result._id?.toString() };
}

export const DEFAULT_BATTERY_MIN = 15;

// ==========================================================
// GAS THRESHOLD RESOLUTION
// ==========================================================
//
// The backend is the authoritative source of alert severity. The gas level
// is a RAW MQ sensor value, NOT ethylene ppm.
//
// Resolution order:
//   1. shipment.thresholds.gasLevel.max  (per-shipment override)
//   2. CRITICAL_GAS_THRESHOLD env value  (global default)

function resolveGasThreshold(thresholds) {
  const shipmentMax = thresholds?.gasLevel?.max;
  if (Number.isFinite(shipmentMax)) return shipmentMax;
  return config.criticalGasThreshold;
}

export function getGasCriticalThreshold(thresholds = {}) {
  return resolveGasThreshold(thresholds);
}

// Gas readings come from an MQ sensor and are surfaced as GAS_CRITICAL, never
// as ethylene ppm.
export const CRITICAL_GAS_ALERT_TYPE = "GAS_CRITICAL";

export const alertRules = [
  {
    type: "HIGH_TEMP",
    isSupported: (r, thresholds) =>
      Number.isFinite(r.temperature) &&
      Number.isFinite(thresholds?.temperature?.max),
    check: (r, thresholds) =>
      r.temperature > thresholds.temperature.max,
    value: (r) => r.temperature,
    threshold: (thresholds) => ({
      operator: ">",
      limit: thresholds.temperature.max,
      field: "temperature",
    }),
    severity: "CRITICAL",
  },
  {
    type: "LOW_TEMP",
    isSupported: (r, thresholds) =>
      Number.isFinite(r.temperature) &&
      Number.isFinite(thresholds?.temperature?.min),
    check: (r, thresholds) =>
      r.temperature < thresholds.temperature.min,
    value: (r) => r.temperature,
    threshold: (thresholds) => ({
      operator: "<",
      limit: thresholds.temperature.min,
      field: "temperature",
    }),
    severity: "WARNING",
  },
  {
    type: "HIGH_HUMIDITY",
    isSupported: (r, thresholds) =>
      Number.isFinite(r.humidity) &&
      Number.isFinite(thresholds?.humidity?.max),
    check: (r, thresholds) =>
      r.humidity > thresholds.humidity.max,
    value: (r) => r.humidity,
    threshold: (thresholds) => ({
      operator: ">",
      limit: thresholds.humidity.max,
      field: "humidity",
    }),
    severity: "WARNING",
  },
  {
    type: "LOW_HUMIDITY",
    isSupported: (r, thresholds) =>
      Number.isFinite(r.humidity) &&
      Number.isFinite(thresholds?.humidity?.min),
    check: (r, thresholds) =>
      r.humidity < thresholds.humidity.min,
    value: (r) => r.humidity,
    threshold: (thresholds) => ({
      operator: "<",
      limit: thresholds.humidity.min,
      field: "humidity",
    }),
    severity: "WARNING",
  },
  {
    type: "LOW_BATTERY",
    isSupported: (r, thresholds) =>
      Number.isFinite(r.battery) &&
      Number.isFinite(thresholds?.battery?.min ?? DEFAULT_BATTERY_MIN),
    check: (r, thresholds) =>
      r.battery < (thresholds.battery?.min ?? DEFAULT_BATTERY_MIN),
    value: (r) => r.battery,
    threshold: (thresholds) => ({
      operator: "<",
      limit: thresholds.battery?.min ?? DEFAULT_BATTERY_MIN,
      field: "battery",
    }),
    severity: "WARNING",
  },
  {
    // GAS_CRITICAL is the mobile critical-alert incident. The threshold is
    // resolved by the backend: shipment override first, then
    // CRITICAL_GAS_THRESHOLD. The gas level is a raw MQ sensor value.
    type: CRITICAL_GAS_ALERT_TYPE,
    isSupported: (r) => Number.isFinite(r.gasLevel),
    check: (r, thresholds) =>
      r.gasLevel > resolveGasThreshold(thresholds),
    value: (r) => r.gasLevel,
    threshold: (thresholds) => ({
      operator: ">",
      limit: resolveGasThreshold(thresholds),
      field: "gasLevel",
      unit: "raw",
    }),
    severity: "CRITICAL",
  },
  {
    type: "DEVICE_OFFLINE",
    isSupported: (r) => typeof r.deviceOffline === "boolean",
    check: (r) => r.deviceOffline === true,
    value: (r) => r.deviceOffline,
    threshold: () => ({ operator: "===", limit: true, field: "deviceOffline" }),
    severity: "CRITICAL",
  },
  {
    type: "TAMPER_ALERT",
    isSupported: (r) => typeof r.tamperDetected === "boolean",
    check: (r) => r.tamperDetected === true,
    value: (r) => r.tamperDetected,
    threshold: () => ({ operator: "===", limit: true, field: "tamperDetected" }),
    severity: "CRITICAL",
  },
];

function getActiveAlertId(reading, rule) {
  const shipmentId = reading.shipmentId || "NO_SHIPMENT";
  return `active__${[shipmentId, reading.deviceId, rule.type]
    .map((value) => encodeURIComponent(value))
    .join("__")}`;
}

function createAlert(reading, rule, thresholds, now) {
  const alert = {
    alertId: getActiveAlertId(reading, rule),
    shipmentId: reading.shipmentId || null,
    deviceId: reading.deviceId,
    type: rule.type,
    severity: rule.severity,
    value: rule.value(reading),
    actualValue: rule.value(reading),
    threshold: rule.threshold(thresholds),
    createdAt: now,
    timestamp: now,
    status: "OPEN",
    acknowledgedAt: null,
    resolvedAt: null,

    // ------------------------------------------------------
    // Incident deduplication metadata
    // ------------------------------------------------------
    // A burst of critical readings stays a single ACTIVE incident. Each new
    // breaching reading updates these fields instead of inserting a row.
    occurrenceCount: 1,
    firstTriggeredAt: now,
    lastTriggeredAt: now,
    lastSeenAt: now,
  };

  // Gas incidents expose the latest raw sensor value. Never presented as
  // ethylene ppm.
  if (rule.type === CRITICAL_GAS_ALERT_TYPE) {
    alert.latestGasLevel = rule.value(reading);
  }

  return alert;
}

function stripMongoId(doc) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return rest;
}

async function transitionAlert(reading, rule, thresholds) {
  const activeId = getActiveAlertId(reading, rule);
  const alertsCollection = getCollection("alerts");
  const now = new Date().toISOString();
  const violating = rule.check(reading, thresholds);

  let currentAlert = await alertsCollection.findOne({
    deviceId: reading.deviceId,
    type: rule.type,
    status: "OPEN",
    shipmentId: reading.shipmentId || null,
  });

  if (!currentAlert && violating) {
    const legacyAlert = await alertsCollection.findOne({
      alertId: activeId,
    });

    // A previous incident with the same active id is ACKNOWLEDGED or RESOLVED.
    //
    //  - If this reading is ALSO breaching, a new incident must begin: fall
    //    through so a fresh OPEN alert is created below (critical incidents are
    //    not permanently silenced by acknowledgement).
    //  - If the alert was merely RESOLVED (recovered) we archive it to history
    //    so the new incident does not overwrite it.
    if (legacyAlert && legacyAlert.status === "RESOLVED") {
      await alertsCollection.insertOne({
        ...stripMongoId(legacyAlert),
        historical: true,
        archivedAt: now,
      });
    }
  }

  if (!currentAlert) {
    currentAlert = await alertsCollection.findOne({ alertId: activeId });
  }

  if (violating) {
    if (currentAlert?.status === "OPEN") {
      // Another breaching reading for the SAME active incident. Do NOT create
      // a new alert. Update the incident in place.
      const incidentUpdate = {
        value: rule.value(reading),
        actualValue: rule.value(reading),
        lastSeenAt: now,
        lastTriggeredAt: now,
        occurrenceCount: (currentAlert.occurrenceCount || 0) + 1,
      };

      if (rule.type === CRITICAL_GAS_ALERT_TYPE) {
        incidentUpdate.latestGasLevel = rule.value(reading);
      }

      await alertsCollection.updateOne(
        { _id: currentAlert._id },
        { $set: incidentUpdate }
      );

      return {
        action: "updated",
        alert: { ...currentAlert, ...incidentUpdate },
      };
    }

    if (currentAlert?.status === "RESOLVED") {
      const historyEntry = {
        ...stripMongoId(currentAlert),
        historical: true,
        archivedAt: now,
      };
      await alertsCollection.insertOne(historyEntry);
    }

    // A brand-new incident: either there was no alert, or the previous one
    // was ACKNOWLEDGED/RESOLVED and a new breach starts a new incident.
    const alert = createAlert(reading, rule, thresholds, now);
    await alertsCollection.replaceOne(
      { alertId: activeId },
      alert,
      { upsert: true }
    );
    return { action: "created", alert };
  }

  // Reading is within threshold.
  // An ACKNOWLEDGED incident is NOT auto-reopened by a normal reading; it stays
  // acknowledged until it recovers (below) or a new breach arrives (above).
  if (currentAlert?.status !== "OPEN") {
    return { action: "unchanged", alert: currentAlert };
  }

  // Recovery: the gas level came back within threshold. The OPEN incident is
  // marked RESOLVED (never deleted); a future breach creates a fresh incident.
  const resolvedAlert = {
    ...currentAlert,
    status: "RESOLVED",
    resolvedAt: now,
    lastSeenAt: now,
  };
  await alertsCollection.updateOne(
    { _id: currentAlert._id },
    { $set: { status: "RESOLVED", resolvedAt: now, lastSeenAt: now } }
  );
  return { action: "resolved", alert: resolvedAlert };
}

export async function evaluateAlerts(reading, shipment = null) {
  if (!reading?.deviceId) return;

  const thresholds = shipment?.thresholds || {};

  for (const rule of alertRules) {
    if (!rule.isSupported(reading, thresholds)) continue;

    try {
      const transition = await transitionAlert(reading, rule, thresholds);

      if (transition.action === "created") {
        console.log(`ALERT triggered: ${rule.type} for device ${reading.deviceId}`);

        if (reading.shipmentId) {
          try {
            await addTimelineEvent(
              reading.shipmentId,
              rule.type,
              "SYSTEM",
              {
                deviceId: reading.deviceId,
                severity: transition.alert.severity,
                value: transition.alert.value,
              }
            );
          } catch (error) {
            console.error("Alert timeline error:", error.message);
          }
        }

        if (rule.type === "HIGH_TEMP" && reading.shipmentId) {
          try {
            await addTimelineEvent(
              reading.shipmentId,
              TimelineEventType.TEMPERATURE_EXCURSION,
              "SYSTEM",
              {
                deviceId: reading.deviceId,
                temperature: reading.temperature,
                threshold: transition.alert.threshold.limit,
                severity: transition.alert.severity,
              }
            );
          } catch (error) {
            console.error("Temperature excursion timeline error:", error.message);
          }
        }

        if (rule.type === "DEVICE_OFFLINE" && reading.shipmentId) {
          try {
            await addTimelineEvent(
              reading.shipmentId,
              TimelineEventType.DEVICE_OFFLINE,
              "SYSTEM",
              {
                deviceId: reading.deviceId,
                severity: transition.alert.severity,
              }
            );
          } catch (error) {
            console.error("Device offline timeline error:", error.message);
          }
        }

        broadcastToAll({ type: "alert.created", data: transition.alert });

        // Backend-originated push for a NEW critical gas incident. Sent only
        // on creation so a burst of readings does not spam the mobile client.
        if (rule.type === CRITICAL_GAS_ALERT_TYPE) {
          try {
            await sendCriticalAlertPush({
              alert: transition.alert,
              deviceId: reading.deviceId,
              shipmentId: reading.shipmentId || transition.alert.shipmentId || null,
              gasLevel: reading.gasLevel,
            });
          } catch (error) {
            console.error("Critical alert push error:", error.message);
          }
        }
      } else if (transition.action === "updated") {
        // Same active incident, refreshed with the newest reading. No push.
        broadcastToAll({ type: "alert.updated", data: transition.alert });
      } else if (transition.action === "resolved") {
        console.log(`ALERT resolved: ${rule.type} for device ${reading.deviceId}`);
        broadcastToAll({ type: "alert.resolved", data: transition.alert });
      }
    } catch (error) {
      console.error(
        `Alert evaluation failed for ${rule.type} on device ${reading.deviceId}:`,
        error.message
      );
    }
  }
}

async function buildAlertAccessFilter(user) {
  if (!user || !user.role) return { _id: null };
  if (user.role === "ADMIN") return {};

  const [shipmentIds, deviceIds] = await Promise.all([
    getAccessibleShipmentIds(user),
    getAccessibleDeviceIds(user),
  ]);

  const orClauses = [];
  if (shipmentIds.length > 0) {
    orClauses.push({ shipmentId: { $in: shipmentIds } });
  }
  if (deviceIds.length > 0) {
    orClauses.push({ deviceId: { $in: deviceIds } });
  }

  if (orClauses.length === 0) return { _id: null };
  return { $or: orClauses };
}

export async function listAlertsForUser(user, filters = {}) {
  const {
    status,
    severity,
    shipmentId,
    deviceId,
    page = 1,
    limit = 20,
  } = filters;

  const parsedPage = Number.parseInt(page, 10);
  const parsedLimit = Number.parseInt(limit, 10);

  const safePage =
    Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  const safeLimit =
    Number.isInteger(parsedLimit) && parsedLimit > 0 ? parsedLimit : 20;

  const accessFilter = await buildAlertAccessFilter(user);
  let query = { ...accessFilter };

  if (status) {
    query.status = status;
  }

  if (severity) {
    query.severity = severity;
  }

  if (shipmentId) {
    query.shipmentId = shipmentId;
  }

  if (deviceId) {
    query.deviceId = deviceId;
  }

  const offset = (safePage - 1) * safeLimit;
  const alertsCollection = getCollection("alerts");

  const [alerts, total] = await Promise.all([
    alertsCollection
      .find(query)
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(safeLimit)
      .toArray(),
    alertsCollection.countDocuments(query),
  ]);

  return {
    alerts: alerts.map((doc) => ({ id: doc._id?.toString(), ...doc })),
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      pages: Math.ceil(total / safeLimit),
    },
  };
}

export async function listAlerts(filters = {}) {
  return listAlertsForUser({ role: "ADMIN" }, filters);
}

export async function getAlertByIdForUser(alertId, user) {
  const alert = await getCollection("alerts").findOne({ alertId });
  if (!alert) return null;

  const accessFilter = await buildAlertAccessFilter(user);
  const accessible = await getCollection("alerts").findOne({ alertId, ...accessFilter });
  if (!accessible) return null;

  return { id: alert._id?.toString(), ...alert };
}

export async function getAlertById(alertId) {
  const doc = await getCollection("alerts").findOne({ alertId });
  if (!doc) return null;
  return { id: doc._id?.toString(), ...doc };
}

export async function acknowledgeAlert(alertId, userId) {
  const now = new Date().toISOString();
  const result = await getCollection("alerts").findOneAndUpdate(
    { alertId },
    { $set: { status: "ACKNOWLEDGED", acknowledgedAt: now, acknowledgedBy: userId } },
    { returnDocument: "after" }
  );
  if (!result) return null;
  return { id: result._id?.toString(), ...result };
}

export async function resolveAlert(alertId, userId) {
  const now = new Date().toISOString();
  const result = await getCollection("alerts").findOneAndUpdate(
    { alertId },
    { $set: { status: "RESOLVED", resolvedAt: now, resolvedBy: userId } },
    { returnDocument: "after" }
  );
  if (!result) return null;
  return { id: result._id?.toString(), ...result };
}
// ==========================================================
// DEVELOPMENT TEST: SYNTHETIC CRITICAL GAS INCIDENT
// ==========================================================
//
// Executes the SAME pipeline as real MQTT telemetry:
//   resolve device -> resolve active shipment -> evaluateAlerts
//   (alert creation -> deduplication -> push notification)
//
// It does NOT fabricate a fake alert response. Callers receive the incident
// that the real pipeline produced.

export async function triggerTestCriticalAlert({ deviceId, gasLevel }) {
  if (typeof deviceId !== "string" || !deviceId.trim()) {
    const error = new Error("deviceId is required");
    error.code = "INVALID_DEVICE_ID";
    throw error;
  }

  if (
    typeof gasLevel !== "number" ||
    !Number.isFinite(gasLevel) ||
    gasLevel < 0
  ) {
    const error = new Error("gasLevel must be a non-negative finite number");
    error.code = "INVALID_GAS_LEVEL";
    throw error;
  }

  const device = await getCollection("devices").findOne({
    deviceId: deviceId.trim(),
  });

  if (!device) {
    const error = new Error("Device not found");
    error.code = "DEVICE_NOT_FOUND";
    throw error;
  }

  const shipmentId = device.currentShipmentId || null;

  const shipment = shipmentId
    ? await getCollection("shipments").findOne({ shipmentId })
    : null;

  // Synthetic reading shaped like a normalized MQTT telemetry document so the
  // exact same alert rules and dedup logic run. No telemetry is stored.
  const reading = {
    deviceId: device.deviceId,
    shipmentId,
    gasLevel,
    temperature: Number.isFinite(device.lastTemperature)
      ? device.lastTemperature
      : null,
    humidity: Number.isFinite(device.lastHumidity)
      ? device.lastHumidity
      : null,
    battery: Number.isFinite(device.battery) ? device.battery : null,
    timestamp: new Date(),
  };

  await evaluateAlerts(reading, shipment);

  // Return the incident the pipeline actually produced.
  const alert = await getCollection("alerts").findOne({
    alertId: getActiveAlertId(
      reading,
      alertRules.find((rule) => rule.type === CRITICAL_GAS_ALERT_TYPE)
    ),
  });

  return {
    deviceId: device.deviceId,
    shipmentId,
    gasLevel,
    threshold: resolveGasThreshold(shipment?.thresholds || {}),
    alert: alert ? { id: alert._id?.toString(), ...alert } : null,
  };
}