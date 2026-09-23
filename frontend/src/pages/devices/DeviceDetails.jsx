import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { getDevice, getDeviceHealth } from "../../api/deviceApi";
import { getLatestDeviceTelemetry } from "../../api/telemetryApi";
import LoadingSpinner from "../../components/common/LoadingSpinner";
import ErrorState from "../../components/common/ErrorState";
import Badge from "../../components/common/Badge";
import {
  getTelemetryLocationName,
  formatTelemetryCoordinates,
  isValidTelemetryLocation,
  formatTelemetryBoolean,
  formatTelemetryNumber,
  formatTelemetrySatelliteCount,
  formatTelemetryTimeSource,
  getTelemetryTimestamp,
} from "../../utils/formatData";

function DeviceDetails() {
  const { id } = useParams();
  const [device, setDevice] = useState(null);
  const [health, setHealth] = useState(null);
  const [telemetry, setTelemetry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [deviceRes, healthRes, telemetryRes] = await Promise.all([
          getDevice(id),
          getDeviceHealth(id),
          getLatestDeviceTelemetry(id),
        ]);
        setDevice(deviceRes ?? {});
        setHealth(healthRes ?? {});
        setTelemetry(telemetryRes ?? null);
      } catch (err) {
        console.error(err);
        setError(err.message || "Error fetching device");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorState message={error} />;

  const deviceStatus = health?.status ?? device?.status ?? "Unknown";
  const isOnline = deviceStatus === "ONLINE";

  return (
    <div className="device-detail container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Device {device?.deviceId ?? id}</h1>
      <p>Status: <Badge variant={isOnline ? "online" : "offline"}>{deviceStatus}</Badge></p>
      <p>Battery: {health?.battery != null ? `${health.battery}%` : "N/A"}</p>
      <p>Last Seen: {health?.lastSeenAt ? new Date(health.lastSeenAt).toLocaleString() : "Location unavailable"}</p>
      <p>Current Shipment: {health?.currentShipmentId ?? device?.currentShipmentId ?? "Not assigned"}</p>
      <p>Firmware: {health?.firmwareVersion ?? device?.firmwareVersion ?? "—"}</p>
      <p>Temperature: {telemetry?.temperature != null ? `${telemetry.temperature}°C` : "No telemetry available"}</p>
      <p>Humidity: {telemetry?.humidity != null ? `${telemetry.humidity}%` : "No telemetry available"}</p>
      <p>Gas Level: {telemetry?.gasLevel != null ? `${telemetry.gasLevel}` : "No telemetry available"}</p>
      <p>Location: {isValidTelemetryLocation(telemetry) ? getTelemetryLocationName(telemetry) : "Location unavailable"}</p>
      <p>GPS: {formatTelemetryBoolean(telemetry?.gpsValid, "GPS valid", "GPS unavailable")}</p>
      <p>Latitude: {isValidTelemetryLocation(telemetry) ? formatTelemetryCoordinates(telemetry).split(", ")[0] : "Location unavailable"}</p>
      <p>Longitude: {isValidTelemetryLocation(telemetry) ? formatTelemetryCoordinates(telemetry).split(", ")[1] : "Location unavailable"}</p>
      <p>Satellites: {formatTelemetrySatelliteCount(telemetry?.satelliteCount)}</p>
      <p>HDOP: {formatTelemetryNumber(telemetry?.hdop, 1)}</p>
      <p>Accuracy: {formatTelemetryNumber(telemetry?.accuracy, 1, " m")}</p>
      <p>Time Source: {formatTelemetryTimeSource(telemetry?.timeSource)}</p>
      <p>Clock: {formatTelemetryBoolean(telemetry?.clockValid, "Clock valid", "Server time fallback")}{telemetry?.clockFallbackReason ? ` (${telemetry.clockFallbackReason})` : ""}</p>
      <p>Telemetry Timestamp: {getTelemetryTimestamp(telemetry) ? new Date(getTelemetryTimestamp(telemetry)).toLocaleString() : "No telemetry available"}</p>
      <p>Received: {telemetry?.receivedAt ? new Date(telemetry.receivedAt).toLocaleString() : "No telemetry available"}</p>
      <Link to={`/devices/assign?deviceId=${device?.deviceId ?? id}`} className="btn btn-primary mt-4">Assign to Shipment</Link>
    </div>
  );
}

export default DeviceDetails;