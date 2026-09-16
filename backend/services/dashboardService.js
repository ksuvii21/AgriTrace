import { getTelemetryCollection, getCollection } from "../core/mongo.js";
import { Role } from "../core/roles.js";
import { listShipments } from "./shipmentService.js";
import { listDevicesForUser } from "./deviceService.js";
import { listAlertsForUser } from "./alertService.js";

export async function getDashboardSummary(uid, role, user = null) {
  const userObj = user || { uid, role };

  const shipmentsResult = await listShipments(uid, role);

  const shipments = Array.isArray(shipmentsResult)
    ? shipmentsResult
    : shipmentsResult?.data || [];

  const shipmentIds = shipments.map((s) => s.shipmentId);

  const completedShipments = shipments.filter(
    (s) => s.status === "DELIVERED"
  ).length;

  const activeShipments = shipments.filter(
    (s) =>
      !["DELIVERED", "CANCELLED"].includes(s.status)
  ).length;

  const devices = await listDevicesForUser(userObj);

  const onlineDevices = devices.filter(
    (device) => device.status === "ONLINE"
  ).length;

  const offlineDevices = devices.filter(
    (device) => device.status === "OFFLINE"
  ).length;

  const alertResult = await listAlertsForUser(userObj, {
    status: "OPEN",
    limit: 100,
  });

  const rawAlerts = Array.isArray(alertResult)
    ? alertResult
    : alertResult?.data || alertResult?.alerts || [];

  const openAlerts = rawAlerts.filter(
    (alert) => alert.status === "OPEN"
  ).length;

  const criticalAlerts = rawAlerts.filter(
    (alert) =>
      alert.status === "OPEN" &&
      alert.severity === "CRITICAL"
  ).length;

  const telemetryCollection = getTelemetryCollection();

  let averageTemperature = null;
  let averageHumidity = null;

  const accessibleShipmentIds = shipmentIds.filter(Boolean);

  if (role === "ADMIN" || accessibleShipmentIds.length > 0) {
    const match =
      role === "ADMIN"
        ? { shipmentId: { $nin: [null, ""] } }
        : {
            shipmentId: {
              $in: accessibleShipmentIds,
            },
          };

    const aggregate = await telemetryCollection
      .aggregate([
        {
          $match: match,
        },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            averageTemperature: {
              $avg: "$temperature",
            },
            averageHumidity: {
              $avg: "$humidity",
            },
          },
        },
      ])
      .toArray();

    if (aggregate.length > 0 && aggregate[0].count > 0) {
      averageTemperature = Number.isFinite(aggregate[0].averageTemperature)
        ? aggregate[0].averageTemperature
        : null;

      averageHumidity = Number.isFinite(aggregate[0].averageHumidity)
        ? aggregate[0].averageHumidity
        : null;
    }
  }

  const recentShipments = shipments.slice(0, 5);

   const recentAlerts = [...rawAlerts]
     .sort(
       (a, b) =>
         new Date(b.timestamp || 0) -
         new Date(a.timestamp || 0)
     )
     .slice(0, 5);

  let availableListings = 0;
  let totalListings = 0;
  let soldListings = 0;

  if (role === Role.FARMER) {
    const farmerListings = await getCollection("listings").find({ farmerId: uid }).toArray();
    availableListings = farmerListings.filter((l) => l.status === "AVAILABLE").length;
    soldListings = farmerListings.filter((l) => l.status === "SOLD").length;
    totalListings = farmerListings.length;
  } else if (role === Role.ADMIN) {
    const pipeline = [
      { $group: {
        _id: null,
        total: { $sum: 1 },
        available: { $sum: { $cond: [{ $eq: ["$status", "AVAILABLE"] }, 1, 0] } },
        sold: { $sum: { $cond: [{ $eq: ["$status", "SOLD"] }, 1, 0] } },
      } },
    ];
    const aggResult = await getCollection("listings").aggregate(pipeline).toArray();
    if (aggResult.length > 0) {
      totalListings = aggResult[0].total;
      availableListings = aggResult[0].available;
      soldListings = aggResult[0].sold;
    }
  }

  let routesOptimized = 0;
  if (role === Role.TRANSPORTER || role === Role.ADMIN) {
    const match = role === Role.TRANSPORTER ? { transporterId: uid } : {};
    routesOptimized = await getCollection("routePlans").countDocuments(match);
  }

  return {
    activeShipments,
    completedShipments,
    onlineDevices,
    offlineDevices,
    openAlerts,
    criticalAlerts,
    averageTemperature:
      Number.isFinite(averageTemperature)
        ? Number(averageTemperature.toFixed(2))
        : null,
    averageHumidity:
      Number.isFinite(averageHumidity)
        ? Number(averageHumidity.toFixed(2))
        : null,
    recentShipments,
    recentAlerts,
    marketplace: {
      availableListings,
      soldListings,
      totalListings,
    },
    routesOptimized,
  };
}