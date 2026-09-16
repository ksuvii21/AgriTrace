import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  FaTemperatureHalf,
  FaDroplet,
  FaLeaf,
  FaBatteryThreeQuarters,
  FaMicrochip,
  FaLocationDot,
} from "react-icons/fa6";

import { getShipment, updateShipmentStatus, assignTransporter, assignWarehouse, updateShipmentThresholds, updateShipmentName } from "../../api/shipmentApi";
import { assignDeviceToShipment } from "../../api/deviceApi";
import { getShipmentTimeline } from "../../api/timelineApi";
import { verifyShipmentIntegrity, createIntegrityCheckpoint } from "../../api/traceabilityApi";
import { getShipmentQr } from "../../api/shipmentApi";
import LoadingSpinner from "../../components/common/LoadingSpinner";
import EmptyState from "../../components/common/EmptyState";
import ErrorState from "../../components/common/ErrorState";
import { useAuth } from "../../context/AuthContext";

const ALLOWED_TRANSITIONS = {
  PENDING: ["DEVICE_ASSIGNED", "CANCELLED"],
  DEVICE_ASSIGNED: ["READY_FOR_DISPATCH", "CANCELLED"],
  READY_FOR_DISPATCH: ["IN_TRANSIT", "CANCELLED"],
  IN_TRANSIT: ["AT_WAREHOUSE", "CANCELLED"],
  AT_WAREHOUSE: ["DELIVERED"],
};

const STATUS_LABELS = {
  PENDING: "Pending",
  DEVICE_ASSIGNED: "Device Assigned",
  READY_FOR_DISPATCH: "Ready for Dispatch",
  IN_TRANSIT: "In Transit",
  AT_WAREHOUSE: "At Warehouse",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

function ShipmentDetails() {
  const { id } = useParams();
  const { role } = useAuth();
  const [shipment, setShipment] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [integrity, setIntegrity] = useState(null);
  const [qrData, setQrData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [thresholdEditor, setThresholdEditor] = useState(null);
  const [assignEditor, setAssignEditor] = useState(null);
  const [nameEditor, setNameEditor] = useState(null);
  const [nameValue, setNameValue] = useState("");
  const [thresholdValues, setThresholdValues] = useState({
    temperatureMin: shipment?.thresholds?.temperature?.min ?? "",
    temperatureMax: shipment?.thresholds?.temperature?.max ?? "",
    humidityMin: shipment?.thresholds?.humidity?.min ?? "",
    humidityMax: shipment?.thresholds?.humidity?.max ?? "",
    gasLevelMax: shipment?.thresholds?.gasLevel?.max ?? "",
  });

  const fetchData = async () => {
    if (!id) {
      setError("Shipment ID is missing");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [shipmentRes, timelineRes, integrityRes] = await Promise.all([
        getShipment(id),
        getShipmentTimeline(id),
        verifyShipmentIntegrity(id),
      ]);
      setShipment(shipmentRes ?? null);
      setTimeline(Array.isArray(timelineRes) ? timelineRes : []);
      setIntegrity(integrityRes ?? null);
      setThresholdValues({
        temperatureMin: shipmentRes?.thresholds?.temperature?.min ?? "",
        temperatureMax: shipmentRes?.thresholds?.temperature?.max ?? "",
        humidityMin: shipmentRes?.thresholds?.humidity?.min ?? "",
        humidityMax: shipmentRes?.thresholds?.humidity?.max ?? "",
        gasLevelMax: shipmentRes?.thresholds?.gasLevel?.max ?? "",
      });
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to load shipment details");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [id]);

  const handleGenerateQr = async () => {
    setActionLoading(true);
    setActionError(null);
    try {
      const data = await getShipmentQr(id);
      setQrData(data ?? null);
    } catch (err) {
      console.error(err);
      setActionError(err.message || "Failed to generate QR");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateCheckpoint = async () => {
    setActionLoading(true);
    setActionError(null);
    try {
      await createIntegrityCheckpoint(id);
      setActionError(null);
      const integrityRes = await verifyShipmentIntegrity(id);
      setIntegrity(integrityRes ?? null);
    } catch (err) {
      console.error(err);
      setActionError(err.message || "Failed to create checkpoint");
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateStatus = (status) => {
    setActionLoading(true);
    setActionError(null);
    updateShipmentStatus(id, status)
      .then(() => {
        setActionLoading(false);
        fetchData();
      })
      .catch((err) => {
        console.error(err);
        setActionError(err.message || "Failed to update status");
        setActionLoading(false);
      });
  };

  const handleAssignDevice = async (deviceId) => {
    if (!deviceId?.trim()) return;
    setActionLoading(true);
    setActionError(null);
    setAssignEditor(null);
    try {
      await assignDeviceToShipment(deviceId.trim(), id);
      fetchData();
    } catch (err) {
      console.error(err);
      setActionError(err.message || "Failed to assign device");
    } finally {
      setActionLoading(false);
    }
  };

  const handleAssignTransporter = async (transporterId) => {
    if (!transporterId?.trim()) return;
    setActionLoading(true);
    setActionError(null);
    setAssignEditor(null);
    try {
      await assignTransporter(id, transporterId.trim());
      fetchData();
    } catch (err) {
      console.error(err);
      setActionError(err.message || "Failed to assign transporter");
    } finally {
      setActionLoading(false);
    }
  };

  const handleAssignWarehouse = async (warehouseId) => {
    if (!warehouseId?.trim()) return;
    setActionLoading(true);
    setActionError(null);
    setAssignEditor(null);
    try {
      await assignWarehouse(id, warehouseId.trim());
      fetchData();
    } catch (err) {
      console.error(err);
      setActionError(err.message || "Failed to assign warehouse");
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateName = async () => {
    if (!nameValue?.trim()) {
      setActionError("Name is required");
      return;
    }
    setActionLoading(true);
    setActionError(null);
    try {
      await updateShipmentName(id, nameValue.trim());
      setNameEditor(null);
      setNameValue("");
      fetchData();
    } catch (err) {
      console.error(err);
      setActionError(err.message || "Failed to update name");
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateThresholds = async () => {
    const tempMin = parseFloat(thresholdValues.temperatureMin);
    const tempMax = parseFloat(thresholdValues.temperatureMax);
    const humidMin = parseFloat(thresholdValues.humidityMin);
    const humidMax = parseFloat(thresholdValues.humidityMax);
    const gasMax = parseFloat(thresholdValues.gasLevelMax);

    if (isNaN(tempMin) || isNaN(tempMax) || tempMin >= tempMax) {
      setActionError("Temperature min must be less than max");
      return;
    }
    if (isNaN(humidMin) || isNaN(humidMax) || humidMin >= humidMax) {
      setActionError("Humidity min must be less than max");
      return;
    }
    if (isNaN(gasMax) || gasMax < 0) {
      setActionError("Gas level max must be non-negative");
      return;
    }

    setActionLoading(true);
    setActionError(null);
    setThresholdEditor(null);
    try {
      await updateShipmentThresholds(id, {
        temperature: { min: tempMin, max: tempMax },
        humidity: { min: humidMin, max: humidMax },
        gasLevel: { max: gasMax },
      });
      fetchData();
    } catch (err) {
      console.error(err);
      setActionError(err.message || "Failed to update thresholds");
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <LoadingSpinner />;
  if (error) return <EmptyState message="Failed to load shipment details" retry={fetchData} />;
  if (!shipment) return <EmptyState message="Shipment not found" />;

  const status = shipment.status || "PENDING";
  const nextStatuses = ALLOWED_TRANSITIONS[status] || [];
  const sId = shipment.shipmentId || shipment.id || id;
  const sName = shipment.name || sId;
  const sProduct = shipment.product || shipment.productName || "Unknown";
  const sSource = shipment.source || "Unknown";
  const sDestination = shipment.destination || "Unknown";
  const sDevice = shipment.assignedDevice || shipment.device || "Not assigned";
  const sTrackingId = shipment.trackingId || "—";

  const journeyStages = [
    { name: "Created", done: true },
    { name: "Device Assigned", done: status !== "PENDING" },
    { name: "Ready for Dispatch", done: ["READY_FOR_DISPATCH", "IN_TRANSIT", "AT_WAREHOUSE", "DELIVERED"].includes(status) },
    { name: "In Transit", done: ["IN_TRANSIT", "AT_WAREHOUSE", "DELIVERED"].includes(status) },
    { name: "At Warehouse", done: ["AT_WAREHOUSE", "DELIVERED"].includes(status) },
    { name: "Delivered", done: status === "DELIVERED" },
  ];

  return (
    <div className="page-container">
      <section className="shipment-detail-header panel">
        <div>
          <span className="eyebrow">SHIPMENT DETAILS</span>
          <h2>{sName}</h2>
          <p>{sProduct} &bull; {sSource} &rarr; {sDestination}</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span className={`badge ${nextStatuses.length ? "transit" : "delivered"}`}>
            {STATUS_LABELS[status] || status}
          </span>
          {(role === "ADMIN" || role === "FARMER") && (
            <button
              className="btn secondary small"
              disabled={actionLoading}
              onClick={() => {
                setNameValue(shipment.name || "");
                setNameEditor(true);
              }}
            >
              Edit Name
            </button>
          )}
        </div>
      </section>

      {actionError && <ErrorState message="Action failed" retry={() => setActionError(null)} />}

      {/* Monitoring Thresholds */}
      <section className="panel">
        <div className="panel-header">
          <h3>Monitoring Thresholds</h3>
        </div>
        <div className="sensor-grid">
          <span className="sensor-card">
            <FaTemperatureHalf />
            <div className="sensor-card-title">Temperature Min</div>
            <div className="sensor-card-value">{shipment.thresholds?.temperature?.min != null ? `${shipment.thresholds.temperature.min}°C` : "—"}</div>
            <div className="sensor-card-sub">Minimum threshold</div>
          </span>
          <span className="sensor-card">
            <FaTemperatureHalf />
            <div className="sensor-card-title">Temperature Max</div>
            <div className="sensor-card-value">{shipment.thresholds?.temperature?.max != null ? `${shipment.thresholds.temperature.max}°C` : "—"}</div>
            <div className="sensor-card-sub">Maximum threshold</div>
          </span>
          <span className="sensor-card">
            <FaDroplet />
            <div className="sensor-card-title">Humidity Min</div>
            <div className="sensor-card-value">{shipment.thresholds?.humidity?.min != null ? `${shipment.thresholds.humidity.min}%` : "—"}</div>
            <div className="sensor-card-sub">Minimum threshold</div>
          </span>
          <span className="sensor-card">
            <FaDroplet />
            <div className="sensor-card-title">Humidity Max</div>
            <div className="sensor-card-value">{shipment.thresholds?.humidity?.max != null ? `${shipment.thresholds.humidity.max}%` : "—"}</div>
            <div className="sensor-card-sub">Maximum threshold</div>
          </span>
          <span className="sensor-card">
            <FaLeaf />
            <div className="sensor-card-title">Gas Max</div>
            <div className="sensor-card-value">{shipment.thresholds?.gasLevel?.max != null ? `${shipment.thresholds.gasLevel.max}` : "—"}</div>
            <div className="sensor-card-sub">Maximum threshold</div>
          </span>
        </div>
      </section>

      {/* Latest Environmental Reading */}
      <section className="panel">
        <div className="panel-header">
          <h3>Latest Environmental Reading</h3>
        </div>
        {sDevice === "Not assigned" ? (
          <div className="sensor-grid">
            <span className="sensor-card">
              <FaTemperatureHalf />
              <div className="sensor-card-title">Temperature</div>
              <div className="sensor-card-value">—</div>
              <div className="sensor-card-sub">No monitoring device assigned</div>
            </span>
            <span className="sensor-card">
              <FaDroplet />
              <div className="sensor-card-title">Humidity</div>
              <div className="sensor-card-value">—</div>
              <div className="sensor-card-sub">No monitoring device assigned</div>
            </span>
            <span className="sensor-card">
              <FaLeaf />
              <div className="sensor-card-title">Gas Level</div>
              <div className="sensor-card-value">—</div>
              <div className="sensor-card-sub">No monitoring device assigned</div>
            </span>
            <span className="sensor-card">
              <FaBatteryThreeQuarters />
              <div className="sensor-card-title">Battery</div>
              <div className="sensor-card-value">—</div>
              <div className="sensor-card-sub">No monitoring device assigned</div>
            </span>
          </div>
        ) : (
          <p className="muted-text">Waiting for first telemetry reading...</p>
        )}
      </section>

      {/* Timeline */}
      <section className="panel">
        <div className="panel-header">
          <h3>Shipment Progress</h3>
        </div>
        <div className="timeline-horizontal">
          {journeyStages.map((step, index) => (
            <div className="timeline-step" key={step.name}>
              <div className={`timeline-dot ${index < journeyStages.findIndex(s => !s.done) || (index === 0 && journeyStages.every(s => s.done)) ? "completed" : ""}`} />
              <span>{step.name}</span>
              {index < journeyStages.length - 1 && <div className="timeline-connector" />}
            </div>
          ))}
        </div>
      </section>

      {/* Actions */}
      <section className="panel actions-section">
        <div className="actions-grid">
          {nextStatuses.map((st) => (
            <button
              key={st}
              className="btn primary"
              disabled={actionLoading}
              onClick={() => handleUpdateStatus(st)}
            >
              Mark as {STATUS_LABELS[st] || st}
            </button>
          ))}
          {role === "ADMIN" || role === "FARMER" ? (
            <button className="btn secondary" disabled={actionLoading} onClick={() => setAssignEditor("device")}>
              Assign Device
            </button>
          ) : null}
          {role === "ADMIN" || role === "FARMER" ? (
            <button className="btn secondary" disabled={actionLoading} onClick={() => setAssignEditor("transporter")}>
              Assign Transporter
            </button>
          ) : null}
          {role === "ADMIN" || role === "FARMER" ? (
            <button className="btn secondary" disabled={actionLoading} onClick={() => setAssignEditor("warehouse")}>
              Assign Warehouse
            </button>
          ) : null}
          {role === "ADMIN" || role === "FARMER" ? (
            <button className="btn secondary" disabled={actionLoading} onClick={() => setThresholdEditor(true)}>
              Update Thresholds
            </button>
          ) : null}
        </div>
      </section>

      {/* Shipment Info */}
      <section className="dashboard-two-column">
        <article className="panel">
          <div className="panel-header"><h3>Shipment Information</h3></div>
          <div className="details-grid">
            <span className="detail-item"><span>Shipment Name</span><strong>{shipment.name || "—"}</strong></span>
            <span className="detail-item"><span>Shipment ID</span><strong>{sId}</strong></span>
            <span className="detail-item"><span>Product</span><strong>{sProduct}</strong></span>
            <span className="detail-item"><span>Source</span><strong>{sSource}</strong></span>
            <span className="detail-item"><span>Destination</span><strong>{sDestination}</strong></span>
            <span className="detail-item"><span>Tracking ID</span><strong>{sTrackingId}</strong></span>
            <span className="detail-item"><span>Status</span><strong>{STATUS_LABELS[status] || status}</strong></span>
            <span className="detail-item"><span>Device</span><strong>{sDevice}</strong></span>
            <span className="detail-item"><span>Created</span><strong>{shipment.createdAt || "—"}</strong></span>
          </div>
        </article>

        {/* Timeline */}
        <article className="panel">
          <div className="panel-header"><h3>Timeline Events</h3></div>
          {timeline.length === 0 ? (
            <p>No timeline events yet.</p>
          ) : (
            <div className="timeline">
              {timeline.map((event, index) => (
                <div className="timeline-item" key={index}>
                  <div className="timeline-marker">•</div>
                  <div className="timeline-content">
                    <h3>{event.type || "Event"}</h3>
                    <span>{event.timestamp ? new Date(event.timestamp).toLocaleString() : "—"}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </article>

        {/* QR */}
        <article className="panel">
          <div className="panel-header"><h3>QR Code</h3></div>
          <div className="qr-display">
            {qrData?.qrDataUrl ? (
              <img src={qrData.qrDataUrl} alt={`QR for ${sId}`} style={{ maxWidth: 200 }} />
            ) : qrData?.traceUrl ? (
              <img src={qrData.traceUrl} alt={`QR for ${sId}`} style={{ maxWidth: 200 }} />
            ) : (
              <p>Click generate to create QR code</p>
            )}
          </div>
          <button className="btn secondary" onClick={handleGenerateQr} disabled={actionLoading}>
            {actionLoading ? "Generating..." : "Generate QR"}
          </button>
        </article>

        {/* Integrity */}
        <article className="panel">
          <div className="panel-header"><h3>Integrity</h3></div>
          {integrity == null ? (
            <p>Click verify to check integrity</p>
          ) : (
            <div>
              <p>Verified: {integrity.verified ? "Yes" : "No"}</p>
              {integrity.checkpoints && integrity.checkpoints.length > 0 && (
                <p>Checkpoints: {integrity.checkpoints.length}</p>
              )}
            </div>
          )}
          <button className="btn secondary" onClick={handleCreateCheckpoint} disabled={actionLoading}>
            Create Checkpoint
          </button>
        </article>
      </section>

      {/* Assign Editor Modal */}
      {assignEditor && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3>
                {assignEditor === "device" ? "Assign Device" :
                 assignEditor === "transporter" ? "Assign Transporter" :
                 "Assign Warehouse"}
              </h3>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const value = e.target.elements.id.value.trim();
                if (assignEditor === "device") handleAssignDevice(value);
                else if (assignEditor === "transporter") handleAssignTransporter(value);
                else handleAssignWarehouse(value);
              }}
            >
              <div className="form-group">
                <label>
                  {assignEditor === "device" ? "Device ID" :
                   assignEditor === "transporter" ? "Transporter ID" :
                   "Warehouse ID"}
                </label>
                <input type="text" name="id" placeholder="Enter ID..." required disabled={actionLoading} />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn secondary" onClick={() => setAssignEditor(null)} disabled={actionLoading}>
                  Cancel
                </button>
                <button type="submit" className="btn primary" disabled={actionLoading}>
                  {actionLoading ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Threshold Editor Modal */}
      {thresholdEditor && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3>Update Environmental Thresholds</h3>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleUpdateThresholds();
              }}
            >
              <div className="form-group">
                <label>Temperature Min (°C)</label>
                <input
                  type="number"
                  step="0.1"
                  value={thresholdValues.temperatureMin}
                  onChange={(e) => setThresholdValues({ ...thresholdValues, temperatureMin: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Temperature Max (°C)</label>
                <input
                  type="number"
                  step="0.1"
                  value={thresholdValues.temperatureMax}
                  onChange={(e) => setThresholdValues({ ...thresholdValues, temperatureMax: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Humidity Min (%)</label>
                <input
                  type="number"
                  value={thresholdValues.humidityMin}
                  onChange={(e) => setThresholdValues({ ...thresholdValues, humidityMin: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Humidity Max (%)</label>
                <input
                  type="number"
                  value={thresholdValues.humidityMax}
                  onChange={(e) => setThresholdValues({ ...thresholdValues, humidityMax: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Gas Level Max</label>
                <input
                  type="number"
                  value={thresholdValues.gasLevelMax}
                  onChange={(e) => setThresholdValues({ ...thresholdValues, gasLevelMax: e.target.value })}
                  required
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn secondary" onClick={() => setThresholdEditor(null)} disabled={actionLoading}>
                  Cancel
                </button>
                <button type="submit" className="btn primary" disabled={actionLoading}>
                  {actionLoading ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Name Editor Modal */}
      {nameEditor && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3>Change Shipment Name</h3>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleUpdateName();
              }}
            >
              <div className="form-group">
                <label>Shipment Name</label>
                <input
                  type="text"
                  name="name"
                  value={nameValue}
                  onChange={(e) => setNameValue(e.target.value)}
                  placeholder="e.g., Fresh tomatoes Sarnath to Lanka"
                  required
                  disabled={actionLoading}
                  autoFocus
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn secondary" onClick={() => setNameEditor(null)} disabled={actionLoading}>
                  Cancel
                </button>
                <button type="submit" className="btn primary" disabled={actionLoading}>
                  {actionLoading ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default ShipmentDetails;
