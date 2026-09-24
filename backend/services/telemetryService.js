import { getTelemetryCollection } from "../core/mongo.js";

function getCollection() {
  const collection = getTelemetryCollection();

  if (!collection) {
    const error = new Error("Telemetry database is not initialized");
    error.code = "TELEMETRY_DATABASE_UNAVAILABLE";
    throw error;
  }

  return collection;
}

function buildHistoryQuery(field, value, filters = {}) {
  const query = { [field]: value };

  if (filters.from || filters.to) {
    query.timestamp = {};

    if (filters.from) query.timestamp.$gte = filters.from;
    if (filters.to) query.timestamp.$lte = filters.to;
  }

  return query;
}

export async function getLatestTelemetryByDevice(deviceId) {
  return getCollection().findOne(
    { deviceId },
    { sort: { timestamp: -1 } }
  );
}

export async function getTelemetryHistoryByDevice(deviceId, filters) {
  return getCollection()
    .find(buildHistoryQuery("deviceId", deviceId, filters))
    .sort({ timestamp: -1 })
    .limit(filters.limit)
    .toArray();
}

export async function getLatestTelemetryByShipment(shipmentId) {
  return getCollection().findOne(
    { shipmentId },
    { sort: { timestamp: -1 } }
  );
}

// Latest telemetry for EVERY device assigned to a shipment.
//
// A shipment may have one assignedDevice on the shipment document, but devices
// also carry currentShipmentId. Both are considered so Live Monitoring and
// Shipment Details agree on which devices belong to the shipment.
export async function getLatestTelemetryByShipmentDevices(shipmentId) {
  const collection = getCollection();

  const deviceIds = await getCollection("devices")
    .distinct("deviceId", { currentShipmentId: shipmentId });

  const shipment = await getCollection("shipments").findOne(
    { shipmentId },
    { projection: { _id: 0, assignedDevice: 1 } }
  );

  if (shipment?.assignedDevice && !deviceIds.includes(shipment.assignedDevice)) {
    deviceIds.push(shipment.assignedDevice);
  }

  if (deviceIds.length === 0) {
    // Fall back to any telemetry already stamped with this shipmentId.
    const fallback = await collection
      .find({ shipmentId })
      .sort({ timestamp: -1 })
      .limit(1)
      .toArray();
    return fallback;
  }

  // One latest reading per device (by timestamp), newest device first.
  const latest = await Promise.all(
    deviceIds.map((deviceId) =>
      collection.findOne(
        { $or: [{ deviceId }, { shipmentId, deviceId }] },
        { sort: { timestamp: -1 } }
      )
    )
  );

  return latest
    .filter(Boolean)
    .sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
}

export async function getTelemetryHistoryByShipment(shipmentId, filters) {
  return getCollection()
    .find(buildHistoryQuery("shipmentId", shipmentId, filters))
    .sort({ timestamp: -1 })
    .limit(filters.limit)
    .toArray();
}
