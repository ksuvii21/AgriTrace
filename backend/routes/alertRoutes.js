// routes/alertRoutes.js
import express from "express";
import { getCurrentUser, requireRole } from "../core/deps.js";
import { Role } from "../core/roles.js";
import { listAlertsForUser, getAlertByIdForUser, acknowledgeAlert, resolveAlert, triggerTestCriticalAlert } from "../services/alertService.js";
import { success, error } from "../utils/apiResponse.js";
import { config } from "../core/config.js";

const router = express.Router();
const alertReadRoles = [Role.ADMIN, Role.FARMER, Role.TRANSPORTER, Role.WAREHOUSE, Role.RETAILER];

// List alerts with filters & pagination
router.get("/", getCurrentUser, requireRole(...alertReadRoles), async (req, res) => {
  try {
    const { status, severity, shipmentId, deviceId, page, limit } = req.query;
    const result = await listAlertsForUser(req.user, { status, severity, shipmentId, deviceId, page: Number(page), limit: Number(limit) });
    return success(res, result);
  } catch (e) {
    console.error("Alert list error:", e);
    return error(res, 500, "Failed to list alerts");
  }
});

// ============================================================
// DEVELOPMENT-ONLY: SYNTHETIC CRITICAL GAS INCIDENT
// ============================================================
//
// Runs the REAL pipeline (device -> shipment -> alert creation ->
// deduplication -> push notification). It does not return a fabricated alert.
//
// Registered BEFORE the "/:alertId" routes so it is not captured as an id.
// Hard-disabled unless NODE_ENV is explicitly "development".
router.post("/test-critical", getCurrentUser, requireRole(...alertReadRoles), async (req, res) => {
  if (config.nodeEnv === "production") {
    return error(res, 404, "Not found");
  }

  try {
    const { deviceId, gasLevel } = req.body || {};
    const result = await triggerTestCriticalAlert({ deviceId, gasLevel });
    return success(res, result, "Critical alert pipeline executed");
  } catch (e) {
    if (["INVALID_DEVICE_ID", "INVALID_GAS_LEVEL"].includes(e.code)) {
      return error(res, 400, e.message);
    }
    if (e.code === "DEVICE_NOT_FOUND") {
      return error(res, 404, e.message);
    }
    console.error("Test critical alert error:", e);
    return error(res, 500, "Failed to run critical alert pipeline");
  }
});

// Get single alert
router.get("/:alertId", getCurrentUser, requireRole(...alertReadRoles), async (req, res) => {
  try {
    const alert = await getAlertByIdForUser(req.params.alertId, req.user);
    if (!alert) return error(res, 404, "Alert not found");
    return success(res, alert);
  } catch (e) {
    console.error("Get alert error:", e);
    return error(res, 500, "Failed to retrieve alert");
  }
});

// Acknowledge alert
// Any authenticated role that can READ alerts may acknowledge one. Restricting
// this to ADMIN previously blocked field/transporter acknowledgment from the
// mobile app.
router.patch("/:alertId/acknowledge", getCurrentUser, requireRole(...alertReadRoles), async (req, res) => {
  try {
    const updated = await acknowledgeAlert(req.params.alertId, req.user.uid);
    if (!updated) return error(res, 404, "Alert not found");
    return success(res, updated, "Alert acknowledged");
  } catch (e) {
    console.error("Acknowledge alert error:", e);
    const status = e.code === "not-found" ? 404 : 500;
    return error(res, status, "Failed to acknowledge alert");
  }
});

// Resolve alert
router.patch("/:alertId/resolve", getCurrentUser, requireRole(Role.ADMIN), async (req, res) => {
  try {
    const updated = await resolveAlert(req.params.alertId, req.user.uid);
    return success(res, updated, "Alert resolved");
  } catch (e) {
    console.error("Resolve alert error:", e);
    const status = e.code === "not-found" ? 404 : 500;
    return error(res, status, "Failed to resolve alert");
  }
});

export default router;