import apiClient from "./axios";

// All functions unwrap the backend { success, message, data } envelope and
// return the `data` payload directly.

const normalizeShipment = (shipment) => {
  if (!shipment || typeof shipment !== "object") return shipment;

  return {
    ...shipment,
    id: shipment.id ?? shipment.shipmentId ?? shipment._id,
  };
};

/** List shipments accessible to the current user. Returns an array. */
export const listShipments = async () => {
  const response = await apiClient.get("/shipments");
  return Array.isArray(response.data) ? response.data.map(normalizeShipment) : [];
};

/** Get one shipment by its shipmentId. */
export const getShipment = async (shipmentId) => {
  const response = await apiClient.get(`/shipments/${shipmentId}`);
  return normalizeShipment(response.data ?? null);
};

/** Create a shipment. Returns the created shipment (with backend IDs). */
export const createShipment = async (payload) => {
  const response = await apiClient.post("/shipments", payload);
  return response.data ?? null;
};

/** Update shipment lifecycle status. */
export const updateShipmentStatus = async (shipmentId, status) => {
  const response = await apiClient.patch(`/shipments/${shipmentId}/status`, {
    status,
  });
  return response.data ?? null;
};

/** Assign a transporter (FARMER/ADMIN only). */
export const assignTransporter = async (shipmentId, transporterId) => {
  const response = await apiClient.patch(
    `/shipments/${shipmentId}/assign-transporter`,
    { transporterId }
  );
  return response.data ?? null;
};

/** Assign a warehouse (FARMER/ADMIN only). */
export const assignWarehouse = async (shipmentId, warehouseId) => {
  const response = await apiClient.patch(
    `/shipments/${shipmentId}/assign-warehouse`,
    { warehouseId }
  );
  return response.data ?? null;
};

/** Update environmental thresholds (FARMER/ADMIN only). */
export const updateShipmentThresholds = async (shipmentId, thresholds) => {
  const response = await apiClient.patch(
    `/shipments/${shipmentId}/thresholds`,
    { thresholds }
  );
  return response.data ?? null;
};

/** Environmental summary for a shipment. */
export const getEnvironmentSummary = async (shipmentId) => {
  const response = await apiClient.get(
    `/shipments/${shipmentId}/environment-summary`
  );
  return response.data ?? null;
};

/** Shipment timeline (backend returns a bare array, not the envelope). */
export const getTimeline = async (shipmentId) => {
  const response = await apiClient.get(`/shipments/${shipmentId}/timeline`);
  return Array.isArray(response.data) ? response.data : [];
};

/** Generate a shipment QR (returns { trackingId, traceUrl, qrDataUrl }). */
export const getShipmentQr = async (shipmentId) => {
  const response = await apiClient.get(`/shipments/${shipmentId}/qr`);
  return response.data ?? null;
};

/** Update shipment name. */
export const updateShipmentName = async (shipmentId, name) => {
  const response = await apiClient.patch(`/shipments/${shipmentId}/name`, {
    name,
  });
  return response.data ?? null;
};
