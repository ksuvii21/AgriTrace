// ==========================================================
// TELEMETRY RISK SERVICE
// ==========================================================
//
// Bridge between stored telemetry and the risk engine
// (`riskAnalysisService`).
//
// Responsibilities:
//  - Load the reading window a shipment needs for trend analysis.
//  - Run the explainable risk evaluation against the shipment's own
//    thresholds.
//  - Project the verdict onto the fields the dashboard / firmware expect:
//    `riskLevel`, `spoilageRiskScore` and a device command intent.
//
// Design notes:
//  - The risk engine is pure and synchronous; this module owns the I/O.
//  - Nothing here is allowed to lose a telemetry reading. Callers wrap it in
//    try/catch and continue when risk evaluation fails.
//  - We never invent thresholds: a missing shipment yields an empty threshold
//    set, which the engine reports as "no bounds configured".

import { getTelemetryCollection, getCollection } from "../core/mongo.js";
import {
  RiskLevel,
  analyzeReading,
  normalizeThresholds,
  riskLevelToDeviceCommand,
} from "./riskAnalysisService.js";

// Number of readings fed to the trend rules. Matches the engine default
// `trendWindow` so the window we read is exactly the window that is analyzed.
const RISK_WINDOW_READINGS = 10;

const DEFAULT_PROFILE_ID = "default";

function requireTelemetryCollection() {
  const collection = getTelemetryCollection();

  if (!collection) {
    const error = new Error("Telemetry database is not initialized");
    error.code = "TELEMETRY_DATABASE_UNAVAILABLE";
    throw error;
  }

  return collection;
}

// ==========================================================
// SHIPMENT THRESHOLDS + PROFILE
// ==========================================================

async function loadShipment(shipmentId) {
  if (!shipmentId) return null;

  try {
    return await getCollection("shipments").findOne({ shipmentId });
  } catch (error) {
    console.error(
      `Risk analysis could not load shipment ${shipmentId}:`,
      error.message
    );
    return null;
  }
}

// Returns the most recent readings for a device, oldest -> newest, which is
// the order the risk engine expects.
export async function loadRecentReadings(
  deviceId,
  { limit = RISK_WINDOW_READINGS, previousSequenceNumber = null } = {}
) {
  if (!deviceId) return [];

  const query = { deviceId };

  // Include the previous reading as well: the trend rules need the reading
  // that came *before* the one being analyzed. When we know the previous
  // sequence number we can pin the query to it and avoid re-scanning history.
  if (Number.isInteger(previousSequenceNumber)) {
    query.sequenceNumber = { $lte: previousSequenceNumber };
  }

  const limit = Math.max(1, limit);

  const docs = await requireTelemetryCollection()
    .find(query)
    .sort({ sequenceNumber: -1 })
    // One extra document so the window still contains the reading that came
    // before the oldest one we intend to analyze.
    .limit(limit + 1)
    .toArray();

  return docs.reverse();
}

// ==========================================================
// CORE EVALUATION
// ==========================================================

/**
 * Evaluate risk for a reading in the context of its shipment.
 *
 * @param {object}   reading             Normalized telemetry reading.
 * @param {object}   options
 * @param {object}   [options.shipment]  Shipment document (thresholds source).
 * @param {object[]} [options.recentReadings] Window oldest -> newest.
 * @param {string}   [options.profileId] Risk profile id.
 * @param {boolean}  [options.buzzerEnabled]
 * @returns {object} Risk verdict + device command intent.
 */
export function evaluateReadingRisk(reading, options = {}) {
  const shipment = options.shipment ?? null;

  const thresholds = normalizeThresholds(
    options.thresholds ?? shipment?.thresholds
  );

  const recentReadings =
    Array.isArray(options.recentReadings) && options.recentReadings.length > 0
      ? options.recentReadings
      : reading
      ? [reading]
      : [];

  const analysis = analyzeReading(reading, {
    thresholds,
    recentReadings,
    profileId: options.profileId || shipment?.riskProfileId || DEFAULT_PROFILE_ID,
  });

  const deviceCommand = riskLevelToDeviceCommand(analysis.level, {
    buzzerEnabled: options.buzzerEnabled !== false,
  });

  return {
    ...analysis,
    shipmentId: reading?.shipmentId ?? shipment?.shipmentId ?? null,
    deviceId: reading?.deviceId ?? null,
    sequenceNumber: reading?.sequenceNumber ?? null,
    deviceCommand,
  };
}

/**
 * Convenience wrapper: load the shipment + reading window, then evaluate.
 * Never throws — returns `null` when the reading or context is unusable so
 * ingestion can carry on.
 */
export async function analyzeTelemetryRecord(reading, options = {}) {
  if (!reading?.deviceId) return null;

  try {
    const shipmentId = reading.shipmentId ?? null;

    const shipment =
      options.shipment !== undefined
        ? options.shipment
        : await loadShipment(shipmentId);

    const recentReadings =
      Array.isArray(options.recentReadings) && options.recentReadings.length > 0
        ? options.recentReadings
        : await loadRecentReadings(reading.deviceId, {
            limit: RISK_WINDOW_READINGS,
            previousSequenceNumber: Number.isInteger(reading.sequenceNumber)
              ? reading.sequenceNumber
              : null,
          });

    return evaluateReadingRisk(reading, {
      shipment,
      recentReadings,
      thresholds: shipment?.thresholds,
      profileId: options.profileId,
      buzzerEnabled: options.buzzerEnabled,
    });
  } catch (error) {
    console.error("Telemetry risk analysis failed:", error.message);
    return null;
  }
}

// ==========================================================
// FETCH-AND-ANALYZE FOR ROUTES
// ==========================================================

export async function evaluateLatestReadingRiskForDevice(deviceId, options = {}) {
  const docs = await requireTelemetryCollection()
    .find({ deviceId })
    .sort({ sequenceNumber: -1 })
    .limit(RISK_WINDOW_READINGS)
    .toArray();

  if (docs.length === 0) return null;

  const window = docs.reverse();
  const latest = window[window.length - 1];

  return analyzeTelemetryRecord(latest, {
    ...options,
    recentReadings: window,
  });
}

export async function evaluateLatestReadingRiskForShipment(shipmentId, options = {}) {
  if (!shipmentId) return null;

  const docs = await requireTelemetryCollection()
    .find({ shipmentId })
    .sort({ sequenceNumber: -1 })
    .limit(RISK_WINDOW_READINGS)
    .toArray();

  if (docs.length === 0) return null;

  const window = docs.reverse();
  const latest = window[window.length - 1];

  return analyzeTelemetryRecord(latest, {
    ...options,
    recentReadings: window,
  });
}

// ==========================================================
// PROJECTION HELPERS
// ==========================================================

// The subset stored on the telemetry document. Deliberately flat so Mongo
// indexes / dashboard queries stay cheap.
export function toTelemetryRiskFields(risk) {
  if (!risk) return {};

  return {
    riskLevel: risk.level,
    riskProfileId: risk.profileId,
    spoilageRiskScore: risk.spoilageRisk?.score ?? 0,
    spoilageRiskLevel: risk.spoilageRisk?.level ?? RiskLevel.UNKNOWN,
    riskReasons: risk.reasons ?? [],
    riskAdvisories: risk.advisories ?? [],
    riskAnalyzedAt: risk.analyzedAt,
    deviceCommand: risk.deviceCommand,
  };
}

// The subset the firmware needs. Kept intentionally tiny: this is the payload
// pushed back over MQTT to the device so its local buzzer/LED matches the
// backend verdict.
export function toDeviceRiskCommand(risk) {
  if (!risk?.deviceCommand) return null;

  return {
    deviceId: risk.deviceId,
    shipmentId: risk.shipmentId,
    sequenceNumber: risk.sequenceNumber,
    level: risk.deviceCommand.level,
    led: risk.deviceCommand.led,
    buzzer: risk.deviceCommand.buzzer,
    requiresLocalFallback: risk.deviceCommand.requiresLocalFallback,
    evaluatedAt: risk.analyzedAt,
  };
}

export { RiskLevel };
