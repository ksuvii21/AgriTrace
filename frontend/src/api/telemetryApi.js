import apiClient from "./axios";

// IMPORTANT: baseURL = VITE_API_URL already includes /api/v1, so these paths
// must NOT repeat the "api/v1" segment.
//
// The telemetry routes return raw JSON (a reading object / array), NOT the
// { success, message, data } envelope used elsewhere. Latest endpoints return
// 404 when no telemetry exists - callers should treat that as "no data".

/** Latest reading for a device. Returns a reading object or null (404). */
export const getLatestDeviceTelemetry = async (deviceId) => {
  try {
    const response = await apiClient.get(`/telemetry/device/${deviceId}/latest`);
    return response.data ?? null;
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
};

/** History for a device. Params: { from, to, limit } (limit 1-1000). */
export const getDeviceTelemetryHistory = async (deviceId, params = {}) => {
  const response = await apiClient.get(`/telemetry/device/${deviceId}/history`, {
    params,
  });
  return Array.isArray(response.data) ? response.data : [];
};

/** Latest reading for a shipment. Returns a reading object or null (404).
 *
 * The backend returns the latest reading for EACH device assigned to the
 * shipment. For the single shipment summary used by the web dashboard we take
 * the most recent device reading.
 */
export const getLatestShipmentTelemetry = async (shipmentId) => {
  try {
    const response = await apiClient.get(
      `/telemetry/shipment/${shipmentId}/latest`
    );
    const data = response.data;
    if (Array.isArray(data)) return data[0] ?? null;
    return data ?? null;
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
};

/** History for a shipment. Params: { from, to, limit }. */
export const getShipmentTelemetryHistory = async (shipmentId, params = {}) => {
  const response = await apiClient.get(
    `/telemetry/shipment/${shipmentId}/history`,
    { params }
  );
  return Array.isArray(response.data) ? response.data : [];
};
