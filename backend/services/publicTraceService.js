import { getCollection } from "../core/mongo.js";

const PUBLIC_TIMELINE_TYPES = new Set([
  "SHIPMENT_CREATED",
  "DEVICE_ASSIGNED",
  "READY_FOR_DISPATCH",
  "SHIPMENT_DISPATCHED",
  "WAREHOUSE_RECEIVED",
  "DELIVERY_COMPLETED",
]);

export async function getPublicTraceByTrackingId(trackingId) {
  if (!trackingId || typeof trackingId !== "string") {
    return null;
  }

  const shipment = await getCollection("shipments").findOne({ trackingId });
  if (!shipment) {
    return null;
  }

  const shipmentId = shipment.shipmentId;
  const telemetryCollection = getCollection("telemetry");

  const latestTelemetry = await telemetryCollection.findOne(
    { shipmentId },
    {
      sort: { timestamp: -1 },
      projection: {
        temperature: 1,
        humidity: 1,
        gasLevel: 1,
        battery: 1,
        latitude: 1,
        longitude: 1,
        gpsValid: 1,
        satelliteCount: 1,
        hdop: 1,
        accuracy: 1,
        timeSource: 1,
        clockValid: 1,
        location: 1,
        timestamp: 1,
      },
    }
  );

  const { getShipmentEnvironmentSummary } = await import("./environmentSummaryService.js");
  const environmentSummary = await getShipmentEnvironmentSummary(shipmentId);

  const { getTimeline } = await import("./timelineService.js");
  const timeline = await getTimeline(shipmentId);

  const publicTimeline = timeline
    .filter((entry) => PUBLIC_TIMELINE_TYPES.has(entry.type))
    .map((entry) => ({
      type: entry.type,
      timestamp: entry.timestamp,
    }));

  const hasDevice = !!shipment.assignedDevice;
  const deviceData = hasDevice
    ? await getCollection("devices").findOne({ deviceId: shipment.assignedDevice })
    : null;

  const { verifyShipmentCheckpoints } = await import("./checkpointService.js");
  const integrity = await verifyShipmentCheckpoints(shipmentId);
  const checkpoints = integrity.checkpoints;
  const { BLOCKCHAIN_STATUS } = await import("../utils/constants.js");
  const blockchainStatus = checkpoints.some((entry) => entry.blockchain?.status === BLOCKCHAIN_STATUS.CONFIRMED)
    ? BLOCKCHAIN_STATUS.CONFIRMED
    : checkpoints.some((entry) => entry.blockchain?.status === BLOCKCHAIN_STATUS.MOCK_CONFIRMED || entry.blockchain?.status === BLOCKCHAIN_STATUS.MOCK_VERIFIED)
      ? BLOCKCHAIN_STATUS.MOCK_CONFIRMED
    : "PENDING";

  const result = {
    trackingId: shipment.trackingId,
    productName: shipment.productName || null,
    origin: shipment.origin || null,
    destination: shipment.destination || null,
    status: shipment.status || null,
    createdAt: shipment.createdAt || null,
    hasMonitoringDevice: hasDevice,
    environment: hasDevice
      ? {
          condition: environmentSummary?.condition ?? "NO_DATA",
          averageTemperature: environmentSummary?.temperature?.average ?? null,
          averageHumidity: environmentSummary?.humidity?.average ?? null,
          maxGasLevel: environmentSummary?.gasLevel?.max ?? null,
          totalViolations: environmentSummary?.violations?.total ?? 0,
        }
      : {
          condition: "NOT_MONITORED",
          averageTemperature: null,
          averageHumidity: null,
          maxGasLevel: null,
          totalViolations: 0,
          message: "No monitoring device was attached to this shipment.",
        },
    timeline: publicTimeline,
    integrity: {
      verified: integrity.verified,
      status: integrity.verified ? "DATA_INTEGRITY_VERIFIED" : checkpoints.length > 0 ? "DATA_INTEGRITY_FAILED" : "NO_CHECKPOINTS",
      checkpointCount: checkpoints.length,
      blockchainStatus,
      blockchainMode: process.env.BLOCKCHAIN_MODE || "mock",
    },
  };

  if (hasDevice && latestTelemetry) {
    result.latestTelemetry = {
      temperature: latestTelemetry.temperature ?? null,
      humidity: latestTelemetry.humidity ?? null,
      gasLevel: latestTelemetry.gasLevel ?? null,
      battery: latestTelemetry.battery ?? null,
      latitude: latestTelemetry.latitude ?? null,
      longitude: latestTelemetry.longitude ?? null,
      gpsValid: latestTelemetry.gpsValid ?? false,
      satelliteCount: latestTelemetry.satelliteCount ?? null,
      hdop: latestTelemetry.hdop ?? null,
      accuracy: latestTelemetry.accuracy ?? null,
      timeSource: latestTelemetry.timeSource ?? "SERVER",
      clockValid: latestTelemetry.clockValid ?? false,
      location: latestTelemetry.location ?? null,
      timestamp: latestTelemetry.timestamp ?? null,
    };
  } else if (hasDevice && !latestTelemetry) {
    result.deviceMessage = "Monitoring device assigned. No telemetry readings are available yet.";
  }

  if (!integrity.verified && checkpoints.length === 0) {
    result.integrity.message = "Integrity checkpoint not available yet";
  }

  return result;
}
