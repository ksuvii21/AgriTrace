import React, { useEffect, useState } from "react";
import {
  FaTemperatureHalf,
  FaDroplet,
  FaLeaf,
  FaBatteryThreeQuarters,
} from "react-icons/fa6";

import { listShipments } from "../api/shipmentApi";
import { listDevices } from "../api/deviceApi";
import {
  getLatestDeviceTelemetry,
  getDeviceTelemetryHistory,
} from "../api/telemetryApi";

import websocketService from "../services/websocketService";

import SensorCard from "../components/common/SensorCard";
import LoadingSpinner from "../components/common/LoadingSpinner";
import EmptyState from "../components/common/EmptyState";

const HISTORY_LENGTH = 20;
const GAS_WARNING_THRESHOLD = 2000;

function Monitoring() {
  const [shipmentId, setShipmentId] = useState("");
  const [selectedDeviceId, setSelectedDeviceId] = useState("");

  const [shipments, setShipments] = useState([]);
  const [devices, setDevices] = useState([]);

  const [telemetry, setTelemetry] = useState(null);

const [history, setHistory] = useState({
  temperature: [],
  humidity: [],
  battery: []
});

const [historyRows, setHistoryRows] = useState([]);

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  const [loading, setLoading] = useState(true);
  const [telemetryLoading, setTelemetryLoading] = useState(false);
  const [error, setError] = useState(null);

  // --------------------------------------------------
  // LOAD SHIPMENTS + DEVICES
  // --------------------------------------------------

  useEffect(() => {
    const fetchInitial = async () => {
      try {
        setError(null);

        const [shipRes, devRes] = await Promise.all([
          listShipments(),
          listDevices(),
        ]);

        const shipmentList = Array.isArray(shipRes) ? shipRes : [];
        const deviceList = Array.isArray(devRes) ? devRes : [];

        setShipments(shipmentList);
        setDevices(deviceList);

        if (shipmentList.length > 0) {
          setShipmentId(
            shipmentList[0].shipmentId ||
            shipmentList[0].id ||
            ""
          );
        }

        // Select first available device.
        // AGRITRACE-001 should appear here once your backend
        // allows the logged-in user to access the device.

        if (deviceList.length > 0) {
          setSelectedDeviceId(
            deviceList[0].deviceId ||
            deviceList[0].id ||
            ""
          );
        }

      } catch (err) {
        console.error(err);

        setError(
          err.message ||
          "Failed to load shipments/devices"
        );

      } finally {
        setLoading(false);
      }
    };

    fetchInitial();
  }, []);

  // --------------------------------------------------
  // LOAD REAL TELEMETRY FROM BACKEND
  // --------------------------------------------------

  useEffect(() => {
    const loadTelemetry = async () => {
      if (!selectedDeviceId) {
        setTelemetry(null);

        setHistory({
          temperature: [],
          humidity: [],
          battery: [],
        });

        return;
      }

      try {
        setTelemetryLoading(true);
        setError(null);

        console.log(
          "[Monitoring] Loading device:",
          selectedDeviceId
        );

        const [latestRes, historyRes] =
          await Promise.all([
            getLatestDeviceTelemetry(
              selectedDeviceId
            ),

            getDeviceTelemetryHistory(
              selectedDeviceId,
              {
                limit
              }
            ),
          ]);

        console.log(
          "[Monitoring] Latest telemetry:",
          latestRes
        );

        console.log(
          "[Monitoring] History:",
          historyRes
        );

        setTelemetry(
          latestRes ?? null
        );

        const histData = Array.isArray(historyRes) ? historyRes : [];

setHistoryRows(histData);

setHistory({
  temperature: histData
    .map(d => d.temperature)
    .filter(v => v != null),

  humidity: histData
    .map(d => d.humidity)
    .filter(v => v != null),

  battery: histData
    .map(d => d.battery)
    .filter(v => v != null),
});

      } catch (err) {
        console.error(
          "[Monitoring] Telemetry error:",
          err
        );

        setTelemetry(null);

        setError(
          err.message ||
          "Failed to load telemetry"
        );

      } finally {
        setTelemetryLoading(false);
      }
    };

    loadTelemetry();

  }, [
    selectedDeviceId,
    page,
    limit,
  ]);

  // --------------------------------------------------
  // WEBSOCKET
  // --------------------------------------------------
  //
  // Your current backend broadcasts live telemetry
  // by SHIPMENT subscription.
  //
  // Therefore this becomes fully active once
  // AGRITRACE-001 is assigned to a shipment.
  // --------------------------------------------------

  useEffect(() => {
    if (
      !selectedDeviceId ||
      !shipmentId
    ) {
      return;
    }

    const wsUrl =
      import.meta.env.VITE_WS_URL;

    if (!wsUrl) {
      return;
    }

    websocketService.connect(
      wsUrl
    );

    // Subscribe to selected shipment if your
    // websocketService supports send/subscribe.

    if (
      typeof websocketService.subscribeToShipment
      === "function"
    ) {
      websocketService.subscribeToShipment(
        shipmentId
      );
    }

    const unsubscribe =
      websocketService.on(
        "telemetry.updated",
        payload => {

          console.log(
            "[WebSocket] Telemetry:",
            payload
          );

          if (
            payload.deviceId ===
            selectedDeviceId
          ) {

            setTelemetry(
              payload
            );

            setHistory(prev => ({
              temperature: [
                ...prev.temperature.slice(
                  -HISTORY_LENGTH + 1
                ),
                payload.temperature,
              ],

              humidity: [
                ...prev.humidity.slice(
                  -HISTORY_LENGTH + 1
                ),
                payload.humidity,
              ],

              battery: [
                ...prev.battery.slice(
                  -HISTORY_LENGTH + 1
                ),
                payload.battery,
              ],
            }));
          }
        }
      );

    return () => {
      unsubscribe();

      if (
        typeof websocketService.unsubscribeFromShipment
        === "function"
      ) {
        websocketService.unsubscribeFromShipment(
          shipmentId
        );
      }
    };

  }, [
    selectedDeviceId,
    shipmentId,
  ]);

  // --------------------------------------------------
  // LOADING / ERROR
  // --------------------------------------------------

  if (loading) {
    return <LoadingSpinner />;
  }

  if (error) {
    return (
      <EmptyState
        message={error}
      />
    );
  }

  // --------------------------------------------------
  // STATUS
  // --------------------------------------------------

  const hasDevice =
    !!selectedDeviceId;

  const hasTelemetry =
    telemetry != null;

  const temperatureWarning =
    hasTelemetry &&
    telemetry.temperature > 28;

  const humidityWarning =
    hasTelemetry &&
    telemetry.humidity > 80;

  const gasWarning =
    hasTelemetry &&
    Number(telemetry.gasLevel) >=
    GAS_WARNING_THRESHOLD;

  const batteryWarning =
    hasTelemetry &&
    telemetry.battery < 25;

  const unsafe =
    temperatureWarning ||
    humidityWarning ||
    gasWarning;

  let statusMessage;
  let statusClass;

  if (!hasDevice) {

    statusMessage =
      "No monitoring device selected";

    statusClass =
      "idle";

  } else if (telemetryLoading) {

    statusMessage =
      "Loading telemetry...";

    statusClass =
      "idle";

  } else if (!hasTelemetry) {

    statusMessage =
      "Waiting for first telemetry reading...";

    statusClass =
      "idle";

  } else if (unsafe) {

    statusMessage =
      "Warning: One or more environmental parameters are outside the configured safety range.";

    statusClass =
      "warning";

  } else {

    statusMessage =
      "All environmental parameters are currently within safe limits.";

    statusClass =
      "safe";
  }

  const handlePrevPage = () =>
    setPage(p =>
      Math.max(
        p - 1,
        1
      )
    );

  const handleNextPage = () =>
    setPage(p =>
      p + 1
    );

  // --------------------------------------------------
  // UI
  // --------------------------------------------------

  return (
    <div className="page-container">

      <section className="toolbar">

        <label>
          Select Shipment

          <select
            value={shipmentId}
            onChange={e =>
              setShipmentId(
                e.target.value
              )
            }
          >
            <option value="">
              No shipment
            </option>

            {shipments.map(shp => (
              <option
                key={
                  shp.shipmentId ||
                  shp.id
                }
                value={
                  shp.shipmentId ||
                  shp.id
                }
              >
                {shp.shipmentId ||
                 shp.id}
                {" — "}
                {shp.product}
              </option>
            ))}

          </select>
        </label>


        <label>
          Select Device

          <select
            value={selectedDeviceId}
            onChange={e => {
              setSelectedDeviceId(
                e.target.value
              );

              setPage(1);
            }}
          >

            <option value="">
              No device
            </option>

            {devices.map(dev => (

              <option
                key={
                  dev.deviceId ||
                  dev.id
                }
                value={
                  dev.deviceId ||
                  dev.id
                }
              >
                {dev.deviceId ||
                 dev.id}
              </option>

            ))}

          </select>
        </label>


        <label>
          Limit per page

          <select
            value={limit}
            onChange={e => {
              setLimit(
                Number(
                  e.target.value
                )
              );

              setPage(1);
            }}
          >

            <option value={10}>
              10
            </option>

            <option value={20}>
              20
            </option>

            <option value={50}>
              50
            </option>

          </select>
        </label>


        <div className="live-pill">
          <span />
          LIVE
        </div>

      </section>


      <section
        className={
          `status-banner ${statusClass}`
        }
      >
        {statusMessage}
      </section>


      <section className="sensor-grid">

        <SensorCard
          icon={
            <FaTemperatureHalf />
          }
          title="Temperature"
          value={
            hasTelemetry &&
            telemetry.temperature != null

              ? `${telemetry.temperature}°C`

              : "—"
          }
          subtitle="8°C – 28°C"
          status={
            temperatureWarning

              ? "warning"

              : hasTelemetry
              ? "safe"
              : "idle"
          }
          history={
            history.temperature
          }
        />


        <SensorCard
          icon={
            <FaDroplet />
          }
          title="Humidity"
          value={
            hasTelemetry &&
            telemetry.humidity != null

              ? `${telemetry.humidity}%`

              : "—"
          }
          subtitle="40% – 80%"
          status={
            humidityWarning

              ? "warning"

              : hasTelemetry
              ? "safe"
              : "idle"
          }
          history={
            history.humidity
          }
        />


        <SensorCard
          icon={
            <FaLeaf />
          }
          title="Gas Level"
          value={
            hasTelemetry &&
            telemetry.gasLevel != null

              ? telemetry.gasLevel

              : "—"
          }
          subtitle={
            gasWarning
              ? "Gas warning"
              : "Prototype gas response"
          }
          status={
            gasWarning

              ? "warning"

              : hasTelemetry
              ? "safe"
              : "idle"
          }
        />


        <SensorCard
          icon={
            <FaBatteryThreeQuarters />
          }
          title="Battery"
          value={
            hasTelemetry &&
            telemetry.battery != null

              ? `${telemetry.battery}%`

              : "—"
          }
          subtitle={
            hasDevice
              ? selectedDeviceId
              : "No device"
          }
          status={
            batteryWarning

              ? "warning"

              : hasTelemetry
              ? "safe"
              : "idle"
          }
          history={
            history.battery
          }
        />

      </section>


<section className="card panel">
  <div className="panel-header">
    <div>
      <h3>Telemetry History</h3>
      <p>Latest readings from {selectedDeviceId}</p>
    </div>
  </div>

  {historyRows.length === 0 ? (
    <div style={{ padding: "25px" }}>
      No telemetry history available.
    </div>
  ) : (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th>Time</th>
            <th>Temperature</th>
            <th>Humidity</th>
            <th>Gas Level</th>
            <th>Battery</th>
            <th>Sequence</th>
          </tr>
        </thead>

        <tbody>
          {historyRows.map((row, index) => (
            <tr key={row._id || `${row.sequenceNumber}-${index}`}>
              <td>
                {row.timestamp
                  ? new Date(row.timestamp).toLocaleString()
                  : "—"}
              </td>

              <td>
                {row.temperature != null
                  ? `${row.temperature}°C`
                  : "—"}
              </td>

              <td>
                {row.humidity != null
                  ? `${row.humidity}%`
                  : "—"}
              </td>

              <td>
                {row.gasLevel ?? "—"}
              </td>

              <td>
                {row.battery != null
                  ? `${row.battery}%`
                  : "—"}
              </td>

              <td>
                {row.sequenceNumber ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )}
</section>

    </div>
  );
}

export default Monitoring;