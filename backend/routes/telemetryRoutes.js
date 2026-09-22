import express from "express";

import { getCurrentUser, requireRole } from "../core/deps.js";
import { Role } from "../core/roles.js";
import {
  getLatestTelemetryByDevice,
  getTelemetryHistoryByDevice,
  getLatestTelemetryByShipment,
  getTelemetryHistoryByShipment,
} from "../services/telemetryService.js";
import { getShipmentForUser } from "../services/shipmentService.js";
import { getDeviceForUser } from "../services/deviceService.js";

const router = express.Router();

const telemetryRoles = [
  Role.FARMER,
  Role.TRANSPORTER,
  Role.WAREHOUSE,
  Role.RETAILER,
  Role.ADMIN,
];

function validateIdentifier(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    return `${name} is required`;
  }

  return null;
}

function parseHistoryFilters(query) {
  const { from, to, limit: rawLimit } = query;
  const parsedFrom = from ? new Date(from) : null;
  const parsedTo = to ? new Date(to) : null;

  if (from && Number.isNaN(parsedFrom.getTime())) {
    return { error: "Invalid from date" };
  }

  if (to && Number.isNaN(parsedTo.getTime())) {
    return { error: "Invalid to date" };
  }

  if (parsedFrom && parsedTo && parsedFrom > parsedTo) {
    return { error: "Invalid date range" };
  }

  let limit = 100;
  if (rawLimit !== undefined) {
    if (!/^\d+$/.test(rawLimit)) {
      return { error: "Invalid limit" };
    }

    limit = Number(rawLimit);
    if (limit < 1 || limit > 1000) {
      return { error: "Limit must be between 1 and 1000" };
    }
  }

  return {
    filters: {
      from: parsedFrom,
      to: parsedTo,
      limit,
    },
  };
}

function sendTelemetryError(res, error) {
  if (error.code === "TELEMETRY_DATABASE_UNAVAILABLE") {
    return res.status(500).json({ detail: "Telemetry database unavailable" });
  }

  console.error("Telemetry request failed:", error);
  return res.status(500).json({ detail: "Failed to retrieve telemetry" });
}

router.get(
  "/device/:deviceId/latest",
  getCurrentUser,
  requireRole(...telemetryRoles),
  async (req, res) => {
    const validationError = validateIdentifier(req.params.deviceId, "deviceId");
    if (validationError) return res.status(400).json({ detail: validationError });

    try {
      const device = await getDeviceForUser(req.params.deviceId.trim(), req.user);
      if (!device) return res.status(404).json({ detail: "Device not found or access denied" });

      const telemetry = await getLatestTelemetryByDevice(req.params.deviceId.trim());
      if (!telemetry) return res.status(404).json({ detail: "Telemetry not found" });
      return res.json(telemetry);
    } catch (error) {
      return sendTelemetryError(res, error);
    }
  }
);

router.get(
  "/device/:deviceId/history",
  getCurrentUser,
  requireRole(...telemetryRoles),
  async (req, res) => {
    const validationError = validateIdentifier(req.params.deviceId, "deviceId");
    if (validationError) return res.status(400).json({ detail: validationError });

    const parsed = parseHistoryFilters(req.query);
    if (parsed.error) return res.status(400).json({ detail: parsed.error });

    try {
      const device = await getDeviceForUser(req.params.deviceId.trim(), req.user);
      if (!device) return res.status(404).json({ detail: "Device not found or access denied" });

      const telemetry = await getTelemetryHistoryByDevice(
        req.params.deviceId.trim(),
        parsed.filters
      );
      return res.json(telemetry);
    } catch (error) {
      return sendTelemetryError(res, error);
    }
  }
);

router.get(
  "/shipment/:shipmentId/latest",
  getCurrentUser,
  requireRole(...telemetryRoles),
  async (req, res) => {
    const validationError = validateIdentifier(req.params.shipmentId, "shipmentId");
    if (validationError) return res.status(400).json({ detail: validationError });

    try {
      const shipment = await getShipmentForUser(req.params.shipmentId.trim(), req.user.uid, req.user.role);
      if (!shipment) return res.status(404).json({ detail: "Shipment not found or access denied" });

      const telemetry = await getLatestTelemetryByShipment(
        shipment.shipmentId
      );
      if (!telemetry) return res.status(404).json({ detail: "Telemetry not found" });
      return res.json(telemetry);
    } catch (error) {
      return sendTelemetryError(res, error);
    }
  }
);

router.get(
  "/shipment/:shipmentId/history",
  getCurrentUser,
  requireRole(...telemetryRoles),
  async (req, res) => {
    const validationError = validateIdentifier(req.params.shipmentId, "shipmentId");
    if (validationError) return res.status(400).json({ detail: validationError });

    const parsed = parseHistoryFilters(req.query);
    if (parsed.error) return res.status(400).json({ detail: parsed.error });

    try {
      const shipment = await getShipmentForUser(req.params.shipmentId.trim(), req.user.uid, req.user.role);
      if (!shipment) return res.status(404).json({ detail: "Shipment not found or access denied" });

      const telemetry = await getTelemetryHistoryByShipment(
        shipment.shipmentId,
        parsed.filters
      );
      return res.json(telemetry);
    } catch (error) {
      return sendTelemetryError(res, error);
    }
  }
);

export default router;
