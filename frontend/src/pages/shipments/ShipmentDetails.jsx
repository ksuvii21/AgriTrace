import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import ShipmentRoutePlanner from "../../components/shipments/ShipmentRoutePlanner";

import {
  FaTemperatureHalf,
  FaDroplet,
  FaLeaf,
  FaBatteryThreeQuarters,
  FaMicrochip,
  FaLocationDot,
  FaTruck,
  FaWarehouse,
  FaBoxOpen,
  FaCircleCheck,
  FaClock,
  FaShieldHalved,
  FaQrcode,
  FaDownload,
  FaRotate,
  FaPen,
  FaLink,
  FaCopy,
  FaCalendarDays,
  FaRoute,
  FaUser,
} from "react-icons/fa6";

import {
  getShipment,
  updateShipmentStatus,
  assignTransporter,
  assignWarehouse,
  updateShipmentThresholds,
  updateShipmentName,
  getShipmentQr,
} from "../../api/shipmentApi";

import { assignDeviceToShipment } from "../../api/deviceApi";
import { getShipmentTimeline } from "../../api/timelineApi";

import {
  verifyShipmentIntegrity,
  createIntegrityCheckpoint,
} from "../../api/traceabilityApi";

import LoadingSpinner from "../../components/common/LoadingSpinner";
import EmptyState from "../../components/common/EmptyState";
import { useAuth } from "../../context/AuthContext";

/* =========================================================
   CONSTANTS
========================================================= */

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

const JOURNEY = [
  {
    key: "PENDING",
    label: "Created",
    icon: FaBoxOpen,
  },
  {
    key: "DEVICE_ASSIGNED",
    label: "Device Assigned",
    icon: FaMicrochip,
  },
  {
    key: "READY_FOR_DISPATCH",
    label: "Ready for Dispatch",
    icon: FaCircleCheck,
  },
  {
    key: "IN_TRANSIT",
    label: "In Transit",
    icon: FaTruck,
  },
  {
    key: "AT_WAREHOUSE",
    label: "At Warehouse",
    icon: FaWarehouse,
  },
  {
    key: "DELIVERED",
    label: "Delivered",
    icon: FaCircleCheck,
  },
];

const STATUS_ORDER = [
  "PENDING",
  "DEVICE_ASSIGNED",
  "READY_FOR_DISPATCH",
  "IN_TRANSIT",
  "AT_WAREHOUSE",
  "DELIVERED",
];

/* =========================================================
   HELPERS
========================================================= */

const hasValue = (value) =>
  value !== undefined &&
  value !== null &&
  value !== "" &&
  value !== "null" &&
  value !== "undefined";

const displayValue = (value) => (hasValue(value) ? value : "");

const formatDate = (value) => {
  if (!hasValue(value)) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString();
};

const getIdFromValue = (value) => {
  if (!value) return "";

  if (typeof value === "string") {
    return value;
  }

  return (
    value.deviceId ||
    value.userId ||
    value.warehouseId ||
    value.transporterId ||
    value.name ||
    value._id ||
    value.id ||
    ""
  );
};

const getTelemetry = (shipment) => {
  if (!shipment) return null;

  return (
    shipment.latestTelemetry ||
    shipment.latestReading ||
    shipment.telemetry ||
    shipment.environmentalReading ||
    shipment.lastTelemetry ||
    null
  );
};

const getStatusClass = (status) => {
  switch (status) {
    case "DELIVERED":
      return "success";

    case "CANCELLED":
      return "alert";

    case "AT_WAREHOUSE":
      return "warehouse";

    case "IN_TRANSIT":
    case "READY_FOR_DISPATCH":
    case "DEVICE_ASSIGNED":
      return "transit";

    default:
      return "offline";
  }
};

/* =========================================================
   SMALL COMPONENTS
========================================================= */

function InfoItem({ icon: Icon, label, value, mono = false }) {
  return (
    <div className="sd-info-item">
      <div className="sd-info-icon">
        <Icon />
      </div>

      <div className="sd-info-content">
        <span>{label}</span>

        {hasValue(value) ? (
          <strong className={mono ? "sd-mono" : ""}>{value}</strong>
        ) : (
          <strong className="sd-empty-value">&nbsp;</strong>
        )}
      </div>
    </div>
  );
}

function SensorCard({
  icon: Icon,
  label,
  value,
  unit = "",
  subtitle,
  emptyText,
}) {
  const available = hasValue(value);

  return (
    <div className={`sd-sensor-card ${available ? "" : "is-empty"}`}>
      <div className="sd-sensor-top">
        <div className="sd-sensor-icon">
          <Icon />
        </div>

        <span>{label}</span>
      </div>

      <div className="sd-sensor-reading">
        {available ? (
          <>
            {value}
            {unit && <small>{unit}</small>}
          </>
        ) : (
          <span className="sd-reading-empty">—</span>
        )}
      </div>

      <div className="sd-sensor-caption">
        {available ? subtitle || "\u00A0" : emptyText || "\u00A0"}
      </div>
    </div>
  );
}

function EmptySection({ icon: Icon, title, text }) {
  return (
    <div className="sd-empty-section">
      <div className="sd-empty-icon">
        <Icon />
      </div>

      <strong>{title}</strong>

      {text && <p>{text}</p>}
    </div>
  );
}

/* =========================================================
   MAIN COMPONENT
========================================================= */

function ShipmentDetails() {
  const { id } = useParams();
  const { role } = useAuth();

  const [shipment, setShipment] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [integrity, setIntegrity] = useState(null);
  const [qrData, setQrData] = useState(null);

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const [thresholdEditor, setThresholdEditor] = useState(false);
  const [assignEditor, setAssignEditor] = useState(null);
  const [nameEditor, setNameEditor] = useState(false);

  const [nameValue, setNameValue] = useState("");

  const [thresholdValues, setThresholdValues] = useState({
    temperatureMin: "",
    temperatureMax: "",
    humidityMin: "",
    humidityMax: "",
    gasLevelMax: "",
  });

  const canManage = role === "ADMIN" || role === "FARMER";

  /* =========================================================
     FETCH
  ========================================================= */

  const fetchData = async () => {
    if (!id) {
      setError("Invalid shipment ID.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    setShipment(null);

    try {
      console.log("[ShipmentDetails] Loading shipment:", id);

      // =====================================================
      // 1. PRIMARY REQUEST
      // =====================================================

      const shipmentRes = await getShipment(id);

      console.log(
        "[ShipmentDetails] Shipment response:",
        shipmentRes
      );

      if (!shipmentRes) {
        throw new Error("Shipment not found.");
      }

      setShipment(shipmentRes);

      setThresholdValues({
        temperatureMin:
          shipmentRes?.thresholds?.temperature?.min ?? "",

        temperatureMax:
          shipmentRes?.thresholds?.temperature?.max ?? "",

        humidityMin:
          shipmentRes?.thresholds?.humidity?.min ?? "",

        humidityMax:
          shipmentRes?.thresholds?.humidity?.max ?? "",

        gasLevelMax:
          shipmentRes?.thresholds?.gasLevel?.max ?? "",
      });

    } catch (err) {
      console.error(
        "[ShipmentDetails] Shipment load failed:",
        err
      );

      setError(
        err?.message ||
          "Failed to load shipment details."
      );

    } finally {
      // CRITICAL:
      // Don't wait for timeline/integrity.
      setLoading(false);
    }

    // =====================================================
    // 2. OPTIONAL TIMELINE
    // =====================================================

    getShipmentTimeline(id)
      .then((result) => {
        console.log(
          "[ShipmentDetails] Timeline:",
          result
        );

        setTimeline(
          Array.isArray(result)
            ? result
            : []
        );
      })
      .catch((err) => {
        console.warn(
          "[ShipmentDetails] Timeline unavailable:",
          err
        );

        setTimeline([]);
      });

    // =====================================================
    // 3. OPTIONAL INTEGRITY
    // =====================================================

    verifyShipmentIntegrity(id)
      .then((result) => {
        console.log(
          "[ShipmentDetails] Integrity:",
          result
        );

        setIntegrity(
          result ?? null
        );
      })
      .catch((err) => {
        console.warn(
          "[ShipmentDetails] Integrity unavailable:",
          err
        );

        setIntegrity(null);
      });
  };

/* =========================================================
   DERIVED DATA
========================================================= */

const status = shipment?.status || "";

const nextStatuses =
  ALLOWED_TRANSITIONS[status] || [];

/*
 * IMPORTANT:
 * This is the REAL identifier returned by the backend.
 * Never fall back to shipment.name or the URL parameter here.
 */
const shipmentId =
  shipment?.shipmentId ||
  shipment?._id ||
  shipment?.id ||
  "";

const shipmentName =
  shipment?.name || "";

const product =
  shipment?.product ||
  shipment?.productName ||
  "";

const source =
  shipment?.source || "";

const destination =
  shipment?.destination || "";

const trackingId =
  shipment?.trackingId || "";

const device =
  getIdFromValue(
    shipment?.assignedDevice
  ) ||
  getIdFromValue(
    shipment?.device
  );

const transporter =
  getIdFromValue(
    shipment?.transporter
  ) ||
  getIdFromValue(
    shipment?.assignedTransporter
  );

const warehouse =
  getIdFromValue(
    shipment?.warehouse
  ) ||
  getIdFromValue(
    shipment?.assignedWarehouse
  );

const telemetry = useMemo(
  () => getTelemetry(shipment),
  [shipment]
);

const temperature =
  telemetry?.temperature ??
  telemetry?.temp ??
  null;

const humidity =
  telemetry?.humidity ??
  null;

const gasLevel =
  telemetry?.gasLevel ??
  telemetry?.gas ??
  telemetry?.gasRaw ??
  null;

const battery =
  telemetry?.battery ??
  telemetry?.batteryLevel ??
  telemetry?.batteryPercent ??
  null;

const telemetryTime =
  telemetry?.timestamp ||
  telemetry?.createdAt ||
  telemetry?.recordedAt ||
  "";

  /* =========================================================
     TOAST
  ========================================================= */

  const showSuccess = (message) => {
    setSuccessMessage(message);

    window.setTimeout(() => {
      setSuccessMessage("");
    }, 3000);
  };

 /* =========================================================
   STATUS UPDATE
========================================================= */

const handleUpdateStatus = async (newStatus) => {
  if (!shipmentId) {
    setActionError(
      "Shipment ID is unavailable."
    );
    return;
  }

  setActionLoading(true);
  setActionError("");

  try {
    await updateShipmentStatus(
      shipmentId,
      newStatus
    );

    showSuccess(
      `Shipment updated to ${
        STATUS_LABELS[newStatus] ||
        newStatus
      }.`
    );

    await fetchData();

  } catch (err) {
    console.error(
      "Shipment status update error:",
      err
    );

    setActionError(
      err?.response?.data?.message ||
      err?.response?.data?.error ||
      err?.message ||
      "Failed to update shipment status."
    );

  } finally {
    setActionLoading(false);
  }
};


/* =========================================================
   ASSIGNMENTS
========================================================= */

const handleAssignDevice = async (deviceId) => {
  const cleanDeviceId =
    deviceId?.trim();

  if (!cleanDeviceId) {
    setActionError(
      "Device ID is required."
    );
    return;
  }

  if (!shipmentId) {
    setActionError(
      "Shipment ID is unavailable."
    );
    return;
  }

  setActionLoading(true);
  setActionError("");

  try {
    /*
     * Your existing device API was already called as:
     *
     * assignDeviceToShipment(deviceId, shipmentId)
     *
     * so we preserve that argument order.
     */
    await assignDeviceToShipment(
      cleanDeviceId,
      shipmentId
    );

    setAssignEditor(null);

    showSuccess(
      "Device assigned successfully."
    );

    await fetchData();

  } catch (err) {
    console.error(
      "Device assignment error:",
      err
    );

    setActionError(
      err?.response?.data?.message ||
      err?.response?.data?.error ||
      err?.message ||
      "Failed to assign device."
    );

  } finally {
    setActionLoading(false);
  }
};


const handleAssignTransporter = async (
  transporterId
) => {
  const cleanTransporterId =
    transporterId?.trim();

  if (!cleanTransporterId) {
    setActionError(
      "Transporter ID is required."
    );
    return;
  }

  if (!shipmentId) {
    setActionError(
      "Shipment ID is unavailable."
    );
    return;
  }

  setActionLoading(true);
  setActionError("");

  try {
    console.log(
      "Assigning transporter:",
      {
        shipmentId,
        transporterId:
          cleanTransporterId,
      }
    );

    await assignTransporter(
      shipmentId,
      cleanTransporterId
    );

    setAssignEditor(null);

    showSuccess(
      "Transporter assigned successfully."
    );

    await fetchData();

  } catch (err) {
    console.error(
      "Transporter assignment error:",
      err
    );

    setActionError(
      err?.response?.data?.message ||
      err?.response?.data?.error ||
      err?.message ||
      "Failed to assign transporter."
    );

  } finally {
    setActionLoading(false);
  }
};


const handleAssignWarehouse = async (
  warehouseId
) => {
  const cleanWarehouseId =
    warehouseId?.trim();

  if (!cleanWarehouseId) {
    setActionError(
      "Warehouse ID is required."
    );
    return;
  }

  if (!shipmentId) {
    setActionError(
      "Shipment ID is unavailable."
    );
    return;
  }

  setActionLoading(true);
  setActionError("");

  try {
    await assignWarehouse(
      shipmentId,
      cleanWarehouseId
    );

    setAssignEditor(null);

    showSuccess(
      "Warehouse assigned successfully."
    );

    await fetchData();

  } catch (err) {
    console.error(
      "Warehouse assignment error:",
      err
    );

    setActionError(
      err?.response?.data?.message ||
      err?.response?.data?.error ||
      err?.message ||
      "Failed to assign warehouse."
    );

  } finally {
    setActionLoading(false);
  }
};

  /* =========================================================
     NAME
  ========================================================= */

const handleUpdateName = async () => {
  const cleanName =
    nameValue.trim();

  if (!cleanName) {
    setActionError(
      "Shipment name is required."
    );
    return;
  }

  if (!shipmentId) {
    setActionError(
      "Shipment ID is unavailable."
    );
    return;
  }

  setActionLoading(true);
  setActionError("");

  try {
    await updateShipmentName(
      shipmentId,
      cleanName
    );

    setNameEditor(false);
    setNameValue("");

    showSuccess(
      "Shipment name updated."
    );

    await fetchData();

  } catch (err) {
    console.error(
      "Shipment name update error:",
      err
    );

    setActionError(
      err?.response?.data?.message ||
      err?.response?.data?.error ||
      err?.message ||
      "Failed to update shipment name."
    );

  } finally {
    setActionLoading(false);
  }
};
  /* =========================================================
     THRESHOLDS
  ========================================================= */

  const handleUpdateThresholds = async () => {
    const tempMin = Number(
      thresholdValues.temperatureMin
    );

    const tempMax = Number(
      thresholdValues.temperatureMax
    );

    const humidityMin = Number(
      thresholdValues.humidityMin
    );

    const humidityMax = Number(
      thresholdValues.humidityMax
    );

    const gasMax = Number(
      thresholdValues.gasLevelMax
    );

    if (
      thresholdValues.temperatureMin === "" ||
      thresholdValues.temperatureMax === "" ||
      Number.isNaN(tempMin) ||
      Number.isNaN(tempMax) ||
      tempMin >= tempMax
    ) {
      setActionError(
        "Temperature minimum must be lower than maximum."
      );
      return;
    }

    if (
      thresholdValues.humidityMin === "" ||
      thresholdValues.humidityMax === "" ||
      Number.isNaN(humidityMin) ||
      Number.isNaN(humidityMax) ||
      humidityMin >= humidityMax
    ) {
      setActionError(
        "Humidity minimum must be lower than maximum."
      );
      return;
    }

    if (
      thresholdValues.gasLevelMax === "" ||
      Number.isNaN(gasMax) ||
      gasMax < 0
    ) {
      setActionError(
        "Gas maximum must be zero or greater."
      );
      return;
    }

    setActionLoading(true);
    setActionError("");

    try {
      await updateShipmentThresholds(
  shipmentId,
  {
    temperature: {
      min: tempMin,
      max: tempMax,
    },

    humidity: {
      min: humidityMin,
      max: humidityMax,
    },

    gasLevel: {
      max: gasMax,
    },
  }
);

      setThresholdEditor(false);

      showSuccess("Monitoring thresholds updated.");

      await fetchData();
    } catch (err) {
      console.error(err);

      setActionError(
        err?.message || "Failed to update thresholds."
      );
    } finally {
      setActionLoading(false);
    }
  };

  /* =========================================================
     QR
  ========================================================= */

const handleGenerateQr = async () => {
  if (!shipmentId) {
    setActionError(
      "Shipment ID is unavailable."
    );
    return;
  }

  setActionLoading(true);
  setActionError("");

  try {
    const data =
      await getShipmentQr(
        shipmentId
      );

    setQrData(
      data || null
    );

    if (data?.qrDataUrl) {
      showSuccess(
        "Shipment QR generated."
      );
    }

  } catch (err) {
    console.error(
      "QR generation error:",
      err
    );

    setActionError(
      err?.response?.data?.message ||
      err?.response?.data?.error ||
      err?.message ||
      "Failed to generate QR code."
    );

  } finally {
    setActionLoading(false);
  }
};

  const handleDownloadQr = async () => {
    if (!qrData?.qrDataUrl) return;

    try {
      /*
       * Data URLs can be downloaded directly.
       * Remote URLs are fetched and converted into a Blob.
       */
      let downloadUrl = qrData.qrDataUrl;
      let shouldRevoke = false;

      if (!qrData.qrDataUrl.startsWith("data:")) {
        const response = await fetch(qrData.qrDataUrl);

        if (!response.ok) {
          throw new Error("Unable to download QR image.");
        }

        const blob = await response.blob();

        downloadUrl = URL.createObjectURL(blob);
        shouldRevoke = true;
      }

      const safeId = String(
        trackingId || shipmentId || "shipment"
      ).replace(/[^a-zA-Z0-9-_]/g, "-");

      const link = document.createElement("a");

      link.href = downloadUrl;
      link.download = `AgriTrace-${safeId}-QR.png`;

      document.body.appendChild(link);

      link.click();
      link.remove();

      if (shouldRevoke) {
        URL.revokeObjectURL(downloadUrl);
      }

      showSuccess("QR PNG downloaded.");
    } catch (err) {
      console.error(err);

      setActionError(
        err?.message || "Unable to download QR code."
      );
    }
  };

  const handleCopyTraceUrl = async () => {
    if (!qrData?.traceUrl) return;

    try {
      await navigator.clipboard.writeText(
        qrData.traceUrl
      );

      showSuccess("Trace URL copied.");
    } catch {
      setActionError("Unable to copy trace URL.");
    }
  };

  /* =========================================================
     INTEGRITY
  ========================================================= */

const handleCreateCheckpoint = async () => {
  if (!shipmentId) {
    setActionError(
      "Shipment ID is unavailable."
    );
    return;
  }

  setActionLoading(true);
  setActionError("");

  try {
    await createIntegrityCheckpoint(
      shipmentId
    );

    const result =
      await verifyShipmentIntegrity(
        shipmentId
      );

    setIntegrity(
      result ?? null
    );

    showSuccess(
      "Integrity checkpoint created."
    );

  } catch (err) {
    console.error(
      "Integrity checkpoint error:",
      err
    );

    setActionError(
      err?.response?.data?.message ||
      err?.response?.data?.error ||
      err?.message ||
      "Failed to create integrity checkpoint."
    );

  } finally {
    setActionLoading(false);
  }
};

  /* =========================================================
     LOAD STATES
  ========================================================= */

  if (loading) {
    return <LoadingSpinner />;
  }

  if (error) {
    return (
      <EmptyState
        message={error}
        retry={fetchData}
      />
    );
  }

  if (!shipment) {
    return (
      <EmptyState message="Shipment not found." />
    );
  }

  /* =========================================================
     JOURNEY STATE
  ========================================================= */

  const currentStatusIndex =
    STATUS_ORDER.indexOf(status);

  /* =========================================================
     UI
  ========================================================= */

  return (
    <div className="page-container shipment-details-page">

      {/* =====================================================
          HERO
      ===================================================== */}

      <section className="sd-hero">
        <div className="sd-hero-main">
          <div className="sd-hero-icon">
            <FaBoxOpen />
          </div>

          <div className="sd-hero-copy">
            <span className="eyebrow">
              SHIPMENT DETAILS
            </span>

            <h1>
              {shipmentName || "Shipment"}
            </h1>

            <div className="sd-hero-meta">
              {product && <span>{product}</span>}

              {(source || destination) && (
                <span className="sd-route">
                  <FaLocationDot />

                  {source && <span>{source}</span>}

                  {source && destination && (
                    <span>→</span>
                  )}

                  {destination && (
                    <span>{destination}</span>
                  )}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="sd-hero-actions">
          {status && (
            <span
              className={`badge ${getStatusClass(
                status
              )}`}
            >
              <span className="badge-dot" />

              {STATUS_LABELS[status] || status}
            </span>
          )}

          {canManage && (
            <button
              className="btn ghost small"
              disabled={actionLoading}
              onClick={() => {
                setNameValue(shipmentName);
                setNameEditor(true);
              }}
            >
              <FaPen />
              Edit Name
            </button>
          )}
        </div>
      </section>

      {/* =====================================================
          ERROR
      ===================================================== */}

      {actionError && (
        <div className="sd-action-error">
          <span>{actionError}</span>

          <button
            type="button"
            onClick={() => setActionError("")}
          >
            ×
          </button>
        </div>
      )}

      {/* =====================================================
          QUICK INFORMATION
      ===================================================== */}

      <section className="panel sd-section">
        <div className="sd-section-header">
          <div>
            <span className="eyebrow">
              OVERVIEW
            </span>

            <h2>Shipment Information</h2>
          </div>
        </div>

        <div className="sd-info-grid">
          <InfoItem
            icon={FaBoxOpen}
            label="Shipment ID"
            value={shipmentId}
            mono
          />

          <InfoItem
            icon={FaRoute}
            label="Tracking ID"
            value={trackingId}
            mono
          />

          <InfoItem
            icon={FaMicrochip}
            label="Monitoring Device"
            value={device}
            mono
          />

          <InfoItem
            icon={FaTruck}
            label="Transporter"
            value={transporter}
          />

          <InfoItem
            icon={FaWarehouse}
            label="Warehouse"
            value={warehouse}
          />

          <InfoItem
            icon={FaCalendarDays}
            label="Created"
            value={formatDate(shipment.createdAt)}
          />
        </div>
      </section>

      {/* =====================================================
          THRESHOLDS
      ===================================================== */}

      <section className="panel sd-section">
        <div className="sd-section-header">
          <div>
            <span className="eyebrow">
              ENVIRONMENT
            </span>

            <h2>Monitoring Thresholds</h2>

            <p>
              Safe operating limits configured for this
              shipment.
            </p>
          </div>

          {canManage && (
            <button
              className="btn ghost small"
              onClick={() =>
                setThresholdEditor(true)
              }
              disabled={actionLoading}
            >
              <FaPen />
              Update Thresholds
            </button>
          )}
        </div>

        <div className="sd-sensor-grid thresholds">
          <SensorCard
            icon={FaTemperatureHalf}
            label="Temperature Min"
            value={
              shipment?.thresholds?.temperature?.min
            }
            unit="°C"
            subtitle="Minimum allowed"
          />

          <SensorCard
            icon={FaTemperatureHalf}
            label="Temperature Max"
            value={
              shipment?.thresholds?.temperature?.max
            }
            unit="°C"
            subtitle="Maximum allowed"
          />

          <SensorCard
            icon={FaDroplet}
            label="Humidity Min"
            value={
              shipment?.thresholds?.humidity?.min
            }
            unit="%"
            subtitle="Minimum allowed"
          />

          <SensorCard
            icon={FaDroplet}
            label="Humidity Max"
            value={
              shipment?.thresholds?.humidity?.max
            }
            unit="%"
            subtitle="Maximum allowed"
          />

          <SensorCard
            icon={FaLeaf}
            label="Gas Max"
            value={
              shipment?.thresholds?.gasLevel?.max
            }
            subtitle="Maximum configured level"
          />
        </div>
      </section>

      {/* =====================================================
          LIVE ENVIRONMENT
      ===================================================== */}

      <section className="panel sd-section">
        <div className="sd-section-header">
          <div>
            <span className="eyebrow">
              TELEMETRY
            </span>

            <h2>Latest Environmental Reading</h2>

            <p>
              Latest sensor data received from the
              assigned AgriTrace node.
            </p>
          </div>

          {telemetryTime && (
            <div className="sd-last-reading">
              <FaClock />
              {formatDate(telemetryTime)}
            </div>
          )}
        </div>

        {!device ? (
          <EmptySection
            icon={FaMicrochip}
            title="No monitoring device assigned"
            text="Assign an AgriTrace device to begin collecting shipment telemetry."
          />
        ) : !telemetry ? (
          <EmptySection
            icon={FaClock}
            title="Waiting for telemetry"
            text="The device is assigned, but no environmental reading has been received yet."
          />
        ) : (
          <div className="sd-sensor-grid telemetry">
            <SensorCard
              icon={FaTemperatureHalf}
              label="Temperature"
              value={temperature}
              unit="°C"
            />

            <SensorCard
              icon={FaDroplet}
              label="Humidity"
              value={humidity}
              unit="%"
            />

            <SensorCard
              icon={FaLeaf}
              label="Gas Level"
              value={gasLevel}
            />

            <SensorCard
              icon={FaBatteryThreeQuarters}
              label="Battery"
              value={battery}
              unit="%"
            />
          </div>
        )}
      </section>

      {/* =====================================================
    JOURNEY
===================================================== */}

{status !== "CANCELLED" && (
  <section className="panel sd-section">
    <div className="sd-section-header">
      <div>
        <span className="eyebrow">
          JOURNEY
        </span>

        <h2>Shipment Progress</h2>

        <p>
          Current stage of the farm-to-fork journey.
        </p>
      </div>
    </div>

    <div className="sd-progress">
      {JOURNEY.map((step, index) => {
        const Icon = step.icon;

        const completed =
          currentStatusIndex > index;

        const current =
          currentStatusIndex === index;

        return (
          <div
            key={step.key}
            className={`sd-progress-step ${
              completed ? "completed" : ""
            } ${current ? "current" : ""}`}
          >
            {index !== JOURNEY.length - 1 && (
              <div className="sd-progress-line" />
            )}

            <div className="sd-progress-icon">
              {completed ? (
                <FaCircleCheck />
              ) : (
                <Icon />
              )}
            </div>

            <span>{step.label}</span>
          </div>
        );
      })}
    </div>
  </section>
)}


{/* =====================================================
    AI ROUTE PLANNER
===================================================== */}

<ShipmentRoutePlanner
  shipment={shipment}
  currentUser={{ role }}
/>


{/* =====================================================
    MANAGEMENT ACTIONS
===================================================== */}

{canManage && (
  <section className="panel sd-section sd-actions-panel">
    <div className="sd-section-header">
      <div>
        <span className="eyebrow">
          MANAGEMENT
        </span>

        <h2>Shipment Actions</h2>
      </div>
    </div>

    <div className="sd-actions">
      {nextStatuses.map((nextStatus) => (
        <button
          key={nextStatus}
          className={
            nextStatus === "CANCELLED"
              ? "btn danger"
              : "btn primary"
          }
          disabled={actionLoading}
          onClick={() =>
            handleUpdateStatus(nextStatus)
          }
        >
          {nextStatus === "CANCELLED"
            ? "Cancel Shipment"
            : `Mark as ${
                STATUS_LABELS[nextStatus] ||
                nextStatus
              }`}
        </button>
      ))}

      <button
        className="btn ghost"
        disabled={actionLoading}
        onClick={() =>
          setAssignEditor("device")
        }
      >
        <FaMicrochip />

        {device
          ? "Change Device"
          : "Assign Device"}
      </button>

      <button
        className="btn ghost"
        disabled={actionLoading}
        onClick={() =>
          setAssignEditor("transporter")
        }
      >
        <FaTruck />

        {transporter
          ? "Change Transporter"
          : "Assign Transporter"}
      </button>

      <button
        className="btn ghost"
        disabled={actionLoading}
        onClick={() =>
          setAssignEditor("warehouse")
        }
      >
        <FaWarehouse />

        {warehouse
          ? "Change Warehouse"
          : "Assign Warehouse"}
      </button>
    </div>
  </section>
)}
      {/* =====================================================
          TIMELINE + TRACEABILITY
      ===================================================== */}

      <div className="sd-main-grid">

        {/* Timeline */}

        <section className="panel sd-section sd-timeline-panel">
          <div className="sd-section-header">
            <div>
              <span className="eyebrow">
                HISTORY
              </span>

              <h2>Timeline Events</h2>
            </div>

            {timeline.length > 0 && (
              <span className="sd-count-pill">
                {timeline.length}
              </span>
            )}
          </div>

          {timeline.length === 0 ? (
            <EmptySection
              icon={FaClock}
              title="No timeline events"
              text="Shipment activity will appear here as the journey progresses."
            />
          ) : (
            <div className="timeline">
              {timeline.map((event, index) => (
                <div
                  className={`tl-item ${
                    index === 0
                      ? "current"
                      : "completed"
                  }`}
                  key={
                    event._id ||
                    event.id ||
                    `${event.type}-${index}`
                  }
                >
                  <div className="tl-marker">
                    {index === 0 ? (
                      <FaClock />
                    ) : (
                      <FaCircleCheck />
                    )}
                  </div>

                  <div className="tl-line" />

                  <div className="tl-body">
                    <div className="sd-timeline-heading">
                      <div>
                        <div className="tl-title">
                          {event.title ||
                            event.type ||
                            event.eventType ||
                            ""}
                        </div>

                        {(event.description ||
                          event.message) && (
                          <div className="tl-sub">
                            {event.description ||
                              event.message}
                          </div>
                        )}

                        {(event.timestamp ||
                          event.createdAt) && (
                          <div className="tl-time">
                            {formatDate(
                              event.timestamp ||
                                event.createdAt
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Right column */}

        <div className="sd-side-column">

          {/* QR */}

          <section className="panel sd-section qr-card">
            <div className="sd-section-header">
              <div>
                <span className="eyebrow">
                  PUBLIC TRACE
                </span>

                <h2>Shipment QR Code</h2>
              </div>

              <FaQrcode className="sd-heading-icon" />
            </div>

            {qrData?.qrDataUrl ? (
              <>
                <div className="qr-display sd-qr-display">
                  <img
                    src={qrData.qrDataUrl}
                    alt="Shipment traceability QR code"
                  />
                </div>

                {qrData?.traceUrl && (
                  <div className="sd-trace-url">
                    <div>
                      <span>Trace URL</span>

                      <strong>
                        {qrData.traceUrl}
                      </strong>
                    </div>

                    <button
                      type="button"
                      title="Copy trace URL"
                      onClick={handleCopyTraceUrl}
                    >
                      <FaCopy />
                    </button>
                  </div>
                )}

                <div className="qr-actions">
                  <button
                    className="btn primary"
                    onClick={handleDownloadQr}
                    disabled={actionLoading}
                  >
                    <FaDownload />
                    Download PNG
                  </button>

                  <button
                    className="btn ghost"
                    onClick={handleGenerateQr}
                    disabled={actionLoading}
                  >
                    <FaRotate />
                    Regenerate
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="sd-qr-empty">
                  <FaQrcode />

                  <strong>
                    QR code not generated
                  </strong>

                  <p>
                    Generate a QR code for this
                    shipment's public traceability
                    record.
                  </p>
                </div>

                <button
                  className="btn primary"
                  onClick={handleGenerateQr}
                  disabled={actionLoading}
                >
                  <FaQrcode />

                  {actionLoading
                    ? "Generating..."
                    : "Generate QR Code"}
                </button>
              </>
            )}
          </section>

          {/* Integrity */}

          <section className="panel sd-section integrity-card">
            <div className="sd-section-header">
              <div>
                <span className="eyebrow">
                  DATA INTEGRITY
                </span>

                <h2>Integrity Verification</h2>
              </div>

              <FaShieldHalved className="sd-heading-icon" />
            </div>

            {integrity === null ? (
              <div className="sd-integrity-empty">
                <div className="sd-integrity-icon neutral">
                  <FaShieldHalved />
                </div>

                <div>
                  <strong>
                    No verification result
                  </strong>

                  <p>
                    No integrity information is
                    currently available.
                  </p>
                </div>
              </div>
            ) : (
              <div className="sd-integrity-content">
                <div
                  className={`sd-integrity-status ${
                    integrity?.verified
                      ? "verified"
                      : "unverified"
                  }`}
                >
                  <div className="sd-integrity-icon">
                    <FaShieldHalved />
                  </div>

                  <div>
                    <span>Integrity Status</span>

                    <strong>
                      {integrity?.verified
                        ? "Verified"
                        : "Not Verified"}
                    </strong>
                  </div>
                </div>

                {Array.isArray(
                  integrity?.checkpoints
                ) && (
                  <div className="sd-checkpoint-count">
                    <span>Checkpoints</span>

                    <strong>
                      {
                        integrity.checkpoints
                          .length
                      }
                    </strong>
                  </div>
                )}
              </div>
            )}

            {canManage && (
              <button
                className="btn ghost sd-checkpoint-btn"
                onClick={handleCreateCheckpoint}
                disabled={actionLoading}
              >
                <FaShieldHalved />
                Create Integrity Checkpoint
              </button>
            )}
          </section>
        </div>
      </div>

      {/* =====================================================
          ASSIGN MODAL
      ===================================================== */}

      {assignEditor && (
        <div
          className="modal-overlay"
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget
            ) {
              setAssignEditor(null);
            }
          }}
        >
          <div className="modal sd-modal">
            <div className="modal-header">
              <div>
                <span className="eyebrow">
                  ASSIGNMENT
                </span>

                <h3>
                  {assignEditor === "device"
                    ? "Assign Monitoring Device"
                    : assignEditor ===
                      "transporter"
                    ? "Assign Transporter"
                    : "Assign Warehouse"}
                </h3>
              </div>
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();

                const value =
                  event.currentTarget.elements
                    .assignmentId.value.trim();

                if (!value) return;

                if (
                  assignEditor === "device"
                ) {
                  handleAssignDevice(value);
                } else if (
                  assignEditor ===
                  "transporter"
                ) {
                  handleAssignTransporter(
                    value
                  );
                } else {
                  handleAssignWarehouse(value);
                }
              }}
            >
              <div className="form-group">
                <label>
                  {assignEditor === "device"
                    ? "Device ID"
                    : assignEditor ===
                      "transporter"
                    ? "Transporter ID"
                    : "Warehouse ID"}
                </label>

                <input
                  name="assignmentId"
                  type="text"
                  autoFocus
                  required
                  disabled={actionLoading}
                  placeholder={
                    assignEditor === "device"
                      ? "Enter device ID"
                      : assignEditor ===
                        "transporter"
                      ? "Enter transporter ID"
                      : "Enter warehouse ID"
                  }
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() =>
                    setAssignEditor(null)
                  }
                  disabled={actionLoading}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="btn primary"
                  disabled={actionLoading}
                >
                  {actionLoading
                    ? "Assigning..."
                    : "Assign"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================
          NAME MODAL
      ===================================================== */}

      {nameEditor && (
        <div
          className="modal-overlay"
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget
            ) {
              setNameEditor(false);
            }
          }}
        >
          <div className="modal sd-modal">
            <div className="modal-header">
              <div>
                <span className="eyebrow">
                  SHIPMENT
                </span>

                <h3>Change Shipment Name</h3>
              </div>
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                handleUpdateName();
              }}
            >
              <div className="form-group">
                <label>Shipment Name</label>

                <input
                  type="text"
                  value={nameValue}
                  onChange={(event) =>
                    setNameValue(
                      event.target.value
                    )
                  }
                  required
                  autoFocus
                  disabled={actionLoading}
                  placeholder="Enter shipment name"
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() =>
                    setNameEditor(false)
                  }
                  disabled={actionLoading}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="btn primary"
                  disabled={actionLoading}
                >
                  {actionLoading
                    ? "Saving..."
                    : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================
          THRESHOLD MODAL
      ===================================================== */}

      {thresholdEditor && (
        <div
          className="modal-overlay"
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget
            ) {
              setThresholdEditor(false);
            }
          }}
        >
          <div className="modal sd-modal sd-threshold-modal">
            <div className="modal-header">
              <div>
                <span className="eyebrow">
                  ENVIRONMENT
                </span>

                <h3>
                  Update Monitoring Thresholds
                </h3>
              </div>
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                handleUpdateThresholds();
              }}
            >
              <div className="sd-modal-grid">
                <div className="form-group">
                  <label>
                    Temperature Min (°C)
                  </label>

                  <input
                    type="number"
                    step="0.1"
                    value={
                      thresholdValues.temperatureMin
                    }
                    onChange={(event) =>
                      setThresholdValues({
                        ...thresholdValues,
                        temperatureMin:
                          event.target.value,
                      })
                    }
                    required
                  />
                </div>

                <div className="form-group">
                  <label>
                    Temperature Max (°C)
                  </label>

                  <input
                    type="number"
                    step="0.1"
                    value={
                      thresholdValues.temperatureMax
                    }
                    onChange={(event) =>
                      setThresholdValues({
                        ...thresholdValues,
                        temperatureMax:
                          event.target.value,
                      })
                    }
                    required
                  />
                </div>

                <div className="form-group">
                  <label>
                    Humidity Min (%)
                  </label>

                  <input
                    type="number"
                    step="0.1"
                    value={
                      thresholdValues.humidityMin
                    }
                    onChange={(event) =>
                      setThresholdValues({
                        ...thresholdValues,
                        humidityMin:
                          event.target.value,
                      })
                    }
                    required
                  />
                </div>

                <div className="form-group">
                  <label>
                    Humidity Max (%)
                  </label>

                  <input
                    type="number"
                    step="0.1"
                    value={
                      thresholdValues.humidityMax
                    }
                    onChange={(event) =>
                      setThresholdValues({
                        ...thresholdValues,
                        humidityMax:
                          event.target.value,
                      })
                    }
                    required
                  />
                </div>

                <div className="form-group sd-modal-full">
                  <label>Gas Level Max</label>

                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={
                      thresholdValues.gasLevelMax
                    }
                    onChange={(event) =>
                      setThresholdValues({
                        ...thresholdValues,
                        gasLevelMax:
                          event.target.value,
                      })
                    }
                    required
                  />
                </div>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() =>
                    setThresholdEditor(false)
                  }
                  disabled={actionLoading}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="btn primary"
                  disabled={actionLoading}
                >
                  {actionLoading
                    ? "Saving..."
                    : "Save Thresholds"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================
          TOAST
      ===================================================== */}

      {successMessage && (
        <div className="toast-container">
          <div className="toast">
            <FaCircleCheck />
            {successMessage}
          </div>
        </div>
      )}
    </div>
  );
}

export default ShipmentDetails;