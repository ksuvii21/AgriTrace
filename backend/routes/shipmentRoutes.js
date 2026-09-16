import express from "express";
import { getCurrentUser, requireRole } from "../core/deps.js";
import { Role } from "../core/roles.js";
import {
  createShipment,
  listShipments,
  getShipmentForUser,
  updateShipmentThresholds,
  updateShipmentStatus,
  updateShipmentName,
  assignTransporter,
  assignWarehouse,
  assignRetailer,
} from "../services/shipmentService.js";
import { success, error } from "../utils/apiResponse.js";

const router = express.Router();
const shipmentReadRoles = [Role.FARMER, Role.TRANSPORTER, Role.WAREHOUSE, Role.RETAILER, Role.ADMIN];
const shipmentWriteRoles = [Role.FARMER, Role.TRANSPORTER, Role.WAREHOUSE, Role.ADMIN];

router.post(
  "/",
  getCurrentUser,
  requireRole(Role.FARMER, Role.ADMIN),
  async (req, res) => {
    try {
      const shipment = await createShipment(req.body, req.user.uid, req.user.role);
      return success(res, shipment, "Shipment created successfully");
    } catch (errorObj) {
      if (errorObj.code === "INVALID_THRESHOLDS") {
        return error(res, 400, errorObj.message);
      }

      console.error("Create shipment error:", errorObj);
      return error(res, 500, "Failed to create shipment");
    }
  }
);

router.patch(
  "/:shipmentId/status",
  getCurrentUser,
  requireRole(...shipmentWriteRoles),
  async (req, res) => {
    try {
      const { status } = req.body;
      if (!status) {
        return error(res, 400, "Status is required");
      }

      const shipment = await updateShipmentStatus(req.params.shipmentId, status, req.user.uid, req.user.role);
      if (!shipment) {
        return error(res, 404, "Shipment not found");
      }

      return success(res, shipment, "Shipment status updated successfully");
    } catch (err) {
      return error(res, 400, err.message);
    }
  }
);

router.patch(
  "/:shipmentId/assign-transporter",
  getCurrentUser,
  requireRole(Role.FARMER, Role.ADMIN),
  async (req, res) => {
    try {
      const { transporterId } = req.body;
      if (!transporterId) {
        return error(res, 400, "transporterId is required");
      }

      const shipment = await assignTransporter(req.params.shipmentId, transporterId, req.user.uid, req.user.role);
      if (!shipment) {
        return error(res, 404, "Shipment not found");
      }

      return success(res, shipment, "Transporter assigned successfully");
    } catch (err) {
      return error(res, 400, err.message);
    }
  }
);

router.patch(
  "/:shipmentId/assign-warehouse",
  getCurrentUser,
  requireRole(Role.FARMER, Role.ADMIN),
  async (req, res) => {
    try {
      const { warehouseId } = req.body;
      if (!warehouseId) {
        return error(res, 400, "warehouseId is required");
      }

      const shipment = await assignWarehouse(req.params.shipmentId, warehouseId, req.user.uid, req.user.role);
      if (!shipment) {
        return error(res, 404, "Shipment not found");
      }

      return success(res, shipment, "Warehouse assigned successfully");
    } catch (err) {
      return error(res, 400, err.message);
    }
  }
);

router.patch(
  "/:shipmentId/assign-retailer",
  getCurrentUser,
  requireRole(Role.FARMER, Role.ADMIN),
  async (req, res) => {
    try {
      const { retailerId } = req.body;
      if (!retailerId) {
        return error(res, 400, "retailerId is required");
      }

      const shipment = await assignRetailer(req.params.shipmentId, retailerId, req.user.uid, req.user.role);
      if (!shipment) {
        return error(res, 404, "Shipment not found");
      }

      return success(res, shipment, "Retailer assigned successfully");
    } catch (err) {
      return error(res, 400, err.message);
    }
  }
);

router.patch(
  "/:shipmentId/name",
  getCurrentUser,
  requireRole(...shipmentWriteRoles),
  async (req, res) => {
    try {
      const { name } = req.body;
      if (!name) {
        return error(res, 400, "Name is required");
      }

      const shipment = await updateShipmentName(
        req.params.shipmentId,
        name,
        req.user.uid
      );
      if (!shipment) {
        return error(res, 404, "Shipment not found");
      }

      return success(res, shipment, "Shipment name updated successfully");
    } catch (err) {
      return error(res, 400, err.message);
    }
  }
);

router.patch(
  "/:shipmentId/thresholds",
  getCurrentUser,
  requireRole(Role.FARMER, Role.ADMIN),
  async (req, res) => {
    try {
      const shipment = await getShipmentForUser(req.params.shipmentId, req.user.uid, req.user.role);
      if (!shipment) {
        return error(res, 404, "Shipment not found");
      }

      const updatedShipment = await updateShipmentThresholds(req.params.shipmentId, req.body.thresholds, req.user.uid);
      return success(res, updatedShipment, "Shipment thresholds updated successfully");
    } catch (errorObj) {
      if (errorObj.code === "INVALID_THRESHOLDS") {
        return error(res, 400, errorObj.message);
      }
      if (errorObj.code === "SHIPMENT_ACCESS_DENIED") {
        return error(res, 403, errorObj.message);
      }

      console.error("Update shipment thresholds error:", errorObj);
      return error(res, 500, "Failed to update thresholds");
    }
  }
);

router.get("/", getCurrentUser, requireRole(...shipmentReadRoles), async (req, res) => {
  const shipments = await listShipments(req.user.uid, req.user.role);
  return success(res, shipments, "Shipments retrieved successfully");
});

router.get(
  "/:shipmentId",
  getCurrentUser,
  requireRole(...shipmentReadRoles),
  async (req, res) => {
    try {
      const shipment = await getShipmentForUser(req.params.shipmentId, req.user.uid, req.user.role);
      if (!shipment) {
        return error(res, 404, "Shipment not found");
      }

      return success(res, shipment, "Shipment retrieved successfully");
    } catch (errorObj) {
      if (errorObj.code === "SHIPMENT_ACCESS_DENIED") {
        return error(res, 403, errorObj.message);
      }

      console.error("Get shipment error:", errorObj);
      return error(res, 500, "Failed to get shipment");
    }
  }
);

export default router;