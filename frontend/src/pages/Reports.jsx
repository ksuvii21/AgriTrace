import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FaFilePdf,
  FaFileLines,
  FaBoxOpen,
  FaMicrochip,
  FaTemperatureHalf,
  FaDroplet,
  FaGasPump,
  FaBatteryThreeQuarters,
  FaTriangleExclamation,
  FaRotate,
  FaDownload,
  FaLocationDot,
  FaClock,
} from "react-icons/fa6";

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import { listShipments } from "../api/shipmentApi";
import { listDevices } from "../api/deviceApi";
import { listAlerts } from "../api/alertApi";

import {
  getShipmentTelemetryHistory,
  getDeviceTelemetryHistory,
} from "../api/telemetryApi";

import {
  getTelemetryLocationName,
  formatTelemetryCoordinates,
  isValidTelemetryLocation,
  formatTelemetryBoolean,
  formatTelemetryTimeSource,
} from "../utils/formatData";

const REPORT_TYPES = {
  SHIPMENT: "shipment",
  DEVICE: "device",
};

const DATE_RANGES = {
  "24h": {
    label: "Last 24 hours",
    milliseconds: 24 * 60 * 60 * 1000,
  },

  "7d": {
    label: "Last 7 days",
    milliseconds: 7 * 24 * 60 * 60 * 1000,
  },

  "30d": {
    label: "Last 30 days",
    milliseconds: 30 * 24 * 60 * 60 * 1000,
  },

  "90d": {
    label: "Last 90 days",
    milliseconds: 90 * 24 * 60 * 60 * 1000,
  },

  all: {
    label: "All available data",
    milliseconds: null,
  },
};

const formatDate = (value) => {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleString();
};

const safeNumber = (value) => {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : null;
};

const formatNumber = (value, digits = 1) => {
  const number = safeNumber(value);

  if (number === null) return "—";

  return number.toFixed(digits);
};

const getShipmentId = (shipment) =>
  shipment?.shipmentId ||
  shipment?.id ||
  shipment?._id ||
  "";

const getDeviceId = (device) =>
  device?.deviceId ||
  device?.id ||
  device?._id ||
  "";

const getShipmentName = (shipment) =>
  shipment?.name ||
  shipment?.productName ||
  shipment?.product ||
  getShipmentId(shipment);

const getShipmentProduct = (shipment) =>
  shipment?.productName ||
  shipment?.product ||
  shipment?.commodity ||
  "—";

const getShipmentOrigin = (shipment) =>
  shipment?.origin?.name ||
  shipment?.origin?.address ||
  shipment?.origin ||
  shipment?.source ||
  "—";

const getShipmentDestination = (shipment) =>
  shipment?.destination?.name ||
  shipment?.destination?.address ||
  shipment?.destination ||
  "—";

const getAssignedDeviceId = (shipment) => {
  const value =
    shipment?.assignedDeviceId ??
    shipment?.deviceId ??
    shipment?.assignedDevice ??
    shipment?.device;

  if (!value) return "";

  if (typeof value === "string") {
    return value;
  }

  return (
    value.deviceId ||
    value.id ||
    value._id ||
    ""
  );
};

const getTelemetryTimestamp = (record) =>
  record?.timestamp ||
  record?.receivedAt ||
  record?.createdAt ||
  null;

const getTelemetryStats = (records = []) => {
  const temperatures = records
    .map((record) => safeNumber(record.temperature))
    .filter((value) => value !== null);

  const humidities = records
    .map((record) => safeNumber(record.humidity))
    .filter((value) => value !== null);

  const gases = records
    .map((record) =>
      safeNumber(
        record.gasLevel ??
          record.gasRaw ??
          record.gas
      )
    )
    .filter((value) => value !== null);

  const batteries = records
    .map((record) => safeNumber(record.battery))
    .filter((value) => value !== null);

  const average = (values) => {
    if (!values.length) return null;

    return (
      values.reduce(
        (total, value) => total + value,
        0
      ) / values.length
    );
  };

  return {
    count: records.length,

    avgTemperature: average(temperatures),

    minTemperature: temperatures.length
      ? Math.min(...temperatures)
      : null,

    maxTemperature: temperatures.length
      ? Math.max(...temperatures)
      : null,

    avgHumidity: average(humidities),

    minHumidity: humidities.length
      ? Math.min(...humidities)
      : null,

    maxHumidity: humidities.length
      ? Math.max(...humidities)
      : null,

    avgGas: average(gases),

    minGas: gases.length
      ? Math.min(...gases)
      : null,

    maxGas: gases.length
      ? Math.max(...gases)
      : null,

    latestBattery: batteries.length
      ? batteries[batteries.length - 1]
      : null,
  };
};

const buildDateParams = (range) => {
  const config = DATE_RANGES[range];

  if (!config || config.milliseconds === null) {
    return {};
  }

  const to = new Date();

  const from = new Date(
    to.getTime() - config.milliseconds
  );

  return {
    from: from.toISOString(),
    to: to.toISOString(),
  };
};

const Reports = () => {
  const [reportType, setReportType] =
    useState(REPORT_TYPES.SHIPMENT);

  const [dateRange, setDateRange] =
    useState("7d");

  const [
    selectedShipmentId,
    setSelectedShipmentId,
  ] = useState("");

  const [
    selectedDeviceId,
    setSelectedDeviceId,
  ] = useState("");

  const [shipments, setShipments] =
    useState([]);

  const [devices, setDevices] =
    useState([]);

  const [telemetry, setTelemetry] =
    useState([]);

  const [reportAlerts, setReportAlerts] =
    useState([]);

  const [initialLoading, setInitialLoading] =
    useState(true);

  const [generating, setGenerating] =
    useState(false);

  const [reportReady, setReportReady] =
    useState(false);

  const [error, setError] =
    useState(null);

  // ============================================================
  // Load real shipments + devices
  // ============================================================

  const loadOptions = useCallback(async () => {
    setInitialLoading(true);
    setError(null);

    try {
      const [
        shipmentData,
        deviceData,
      ] = await Promise.all([
        listShipments(),
        listDevices(),
      ]);

      const shipmentList =
        Array.isArray(shipmentData)
          ? shipmentData
          : [];

      const deviceList =
        Array.isArray(deviceData)
          ? deviceData
          : [];

      setShipments(shipmentList);
      setDevices(deviceList);

      if (
        shipmentList.length &&
        !selectedShipmentId
      ) {
        setSelectedShipmentId(
          getShipmentId(shipmentList[0])
        );
      }

      if (
        deviceList.length &&
        !selectedDeviceId
      ) {
        setSelectedDeviceId(
          getDeviceId(deviceList[0])
        );
      }
    } catch (err) {
      console.error(
        "Failed to load report options",
        err
      );

      setError(
        err.message ||
          "Unable to load shipments and devices."
      );
    } finally {
      setInitialLoading(false);
    }
  }, [selectedShipmentId, selectedDeviceId]);

  useEffect(() => {
    loadOptions();
    // Only initial page load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset generated report whenever filters change.

  useEffect(() => {
    setReportReady(false);
    setTelemetry([]);
    setReportAlerts([]);
    setError(null);
  }, [
    reportType,
    selectedShipmentId,
    selectedDeviceId,
    dateRange,
  ]);

  // ============================================================
  // Selected records
  // ============================================================

  const selectedShipment = useMemo(
    () =>
      shipments.find(
        (shipment) =>
          String(getShipmentId(shipment)) ===
          String(selectedShipmentId)
      ) || null,
    [shipments, selectedShipmentId]
  );

  const selectedDevice = useMemo(
    () =>
      devices.find(
        (device) =>
          String(getDeviceId(device)) ===
          String(selectedDeviceId)
      ) || null,
    [devices, selectedDeviceId]
  );

  // ============================================================
  // Generate report data
  // ============================================================

  const generateReport = async () => {
    if (
      reportType === REPORT_TYPES.SHIPMENT &&
      !selectedShipmentId
    ) {
      setError(
        "Please select a shipment first."
      );
      return;
    }

    if (
      reportType === REPORT_TYPES.DEVICE &&
      !selectedDeviceId
    ) {
      setError(
        "Please select a device first."
      );
      return;
    }

    setGenerating(true);
    setError(null);
    setReportReady(false);

    try {
      const dateParams =
        buildDateParams(dateRange);

      if (
        reportType ===
        REPORT_TYPES.SHIPMENT
      ) {
        const [
          telemetryData,
          alertResponse,
        ] = await Promise.all([
          getShipmentTelemetryHistory(
            selectedShipmentId,
            {
              ...dateParams,
              limit: 1000,
            }
          ),

          listAlerts({
            shipmentId:
              selectedShipmentId,
            limit: 100,
          }),
        ]);

        setTelemetry(
          Array.isArray(telemetryData)
            ? telemetryData
            : []
        );

        setReportAlerts(
          Array.isArray(
            alertResponse?.alerts
          )
            ? alertResponse.alerts
            : []
        );
      } else {
        const [
          telemetryData,
          alertResponse,
        ] = await Promise.all([
          getDeviceTelemetryHistory(
            selectedDeviceId,
            {
              ...dateParams,
              limit: 1000,
            }
          ),

          listAlerts({
            deviceId: selectedDeviceId,
            limit: 100,
          }),
        ]);

        setTelemetry(
          Array.isArray(telemetryData)
            ? telemetryData
            : []
        );

        setReportAlerts(
          Array.isArray(
            alertResponse?.alerts
          )
            ? alertResponse.alerts
            : []
        );
      }

      setReportReady(true);
    } catch (err) {
      console.error(
        "Failed to generate report",
        err
      );

      setError(
        err.message ||
          "Failed to generate report."
      );
    } finally {
      setGenerating(false);
    }
  };

  // ============================================================
  // Statistics
  // ============================================================

  const stats = useMemo(
    () => getTelemetryStats(telemetry),
    [telemetry]
  );

  const criticalAlerts =
    reportAlerts.filter(
      (alert) =>
        String(
          alert.severity
        ).toUpperCase() === "CRITICAL"
    ).length;

  const warningAlerts =
    reportAlerts.filter(
      (alert) =>
        String(
          alert.severity
        ).toUpperCase() === "WARNING"
    ).length;

  // ============================================================
  // PDF
  // ============================================================

  const downloadPDF = () => {
    if (!reportReady) {
      setError(
        "Generate the report before downloading the PDF."
      );
      return;
    }

    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    const pageWidth =
      doc.internal.pageSize.getWidth();

    const pageHeight =
      doc.internal.pageSize.getHeight();

    const generatedAt =
      new Date().toLocaleString();

    const rangeLabel =
      DATE_RANGES[dateRange]?.label ||
      dateRange;

    // ==========================================================
    // Header
    // ==========================================================

    doc.setFillColor(27, 101, 138);

    doc.rect(
      0,
      0,
      pageWidth,
      32,
      "F"
    );

    doc.setTextColor(255, 255, 255);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);

    doc.text(
      "AgriTrace",
      14,
      14
    );

    doc.setFontSize(9);
    doc.setFont(
      "helvetica",
      "normal"
    );

    doc.text(
      "Farm-to-Fork IoT Traceability",
      14,
      21
    );

    doc.setFontSize(12);
    doc.setFont(
      "helvetica",
      "bold"
    );

    doc.text(
      reportType ===
        REPORT_TYPES.SHIPMENT
        ? "Shipment Traceability Report"
        : "Device Telemetry Report",
      pageWidth - 14,
      14,
      {
        align: "right",
      }
    );

    doc.setFontSize(8);
    doc.setFont(
      "helvetica",
      "normal"
    );

    doc.text(
      `Generated: ${generatedAt}`,
      pageWidth - 14,
      21,
      {
        align: "right",
      }
    );

    doc.setTextColor(30, 41, 59);

    let y = 42;

    // ==========================================================
    // Report information
    // ==========================================================

    doc.setFontSize(13);
    doc.setFont(
      "helvetica",
      "bold"
    );

    doc.text(
      "Report Information",
      14,
      y
    );

    y += 5;

    const reportInfoRows =
      reportType ===
      REPORT_TYPES.SHIPMENT
        ? [
            [
              "Shipment ID",
              selectedShipmentId ||
                "—",
            ],
            [
              "Shipment Name",
              getShipmentName(
                selectedShipment
              ),
            ],
            [
              "Product",
              getShipmentProduct(
                selectedShipment
              ),
            ],
            [
              "Status",
              selectedShipment?.status ||
                "—",
            ],
            [
              "Origin",
              String(
                getShipmentOrigin(
                  selectedShipment
                )
              ),
            ],
            [
              "Destination",
              String(
                getShipmentDestination(
                  selectedShipment
                )
              ),
            ],
            [
              "Assigned Device",
              getAssignedDeviceId(
                selectedShipment
              ) || "—",
            ],
            [
              "Report Period",
              rangeLabel,
            ],
          ]
        : [
            [
              "Device ID",
              selectedDeviceId ||
                "—",
            ],
            [
              "Device Status",
              selectedDevice?.status ||
                "—",
            ],
            [
              "Firmware",
              selectedDevice
                ?.firmwareVersion ||
                "—",
            ],
            [
              "Current Shipment",
              selectedDevice
                ?.currentShipmentId ||
                selectedDevice
                  ?.shipmentId ||
                "—",
            ],
            [
              "Last Seen",
              formatDate(
                selectedDevice
                  ?.lastSeenAt
              ),
            ],
            [
              "Report Period",
              rangeLabel,
            ],
          ];

    autoTable(doc, {
      startY: y,
      body: reportInfoRows,
      theme: "grid",

      styles: {
        fontSize: 9,
        cellPadding: 3,
      },

      columnStyles: {
        0: {
          fontStyle: "bold",
          cellWidth: 45,
        },
      },

      headStyles: {
        fillColor: [27, 101, 138],
      },
    });

    y =
      doc.lastAutoTable.finalY + 10;

    // ==========================================================
    // Environmental summary
    // ==========================================================

    doc.setFontSize(13);
    doc.setFont(
      "helvetica",
      "bold"
    );

    doc.text(
      "Telemetry Summary",
      14,
      y
    );

    y += 5;

    autoTable(doc, {
      startY: y,

      head: [
        [
          "Metric",
          "Value",
          "Minimum",
          "Maximum",
        ],
      ],

      body: [
        [
          "Telemetry Records",
          String(stats.count),
          "—",
          "—",
        ],

        [
          "Temperature",
          stats.avgTemperature !== null
            ? `${formatNumber(
                stats.avgTemperature
              )} C avg`
            : "—",

          stats.minTemperature !== null
            ? `${formatNumber(
                stats.minTemperature
              )} C`
            : "—",

          stats.maxTemperature !== null
            ? `${formatNumber(
                stats.maxTemperature
              )} C`
            : "—",
        ],

        [
          "Humidity",
          stats.avgHumidity !== null
            ? `${formatNumber(
                stats.avgHumidity
              )}% avg`
            : "—",

          stats.minHumidity !== null
            ? `${formatNumber(
                stats.minHumidity
              )}%`
            : "—",

          stats.maxHumidity !== null
            ? `${formatNumber(
                stats.maxHumidity
              )}%`
            : "—",
        ],

        [
          "Gas Response",
          stats.avgGas !== null
            ? `${formatNumber(
                stats.avgGas
              )} avg`
            : "—",

          stats.minGas !== null
            ? formatNumber(
                stats.minGas
              )
            : "—",

          stats.maxGas !== null
            ? formatNumber(
                stats.maxGas
              )
            : "—",
        ],

        [
          "Latest Battery",
          stats.latestBattery !== null
            ? `${formatNumber(
                stats.latestBattery,
                0
              )}%`
            : "—",
          "—",
          "—",
        ],
      ],

      theme: "grid",

      headStyles: {
        fillColor: [16, 185, 129],
      },

      styles: {
        fontSize: 8.5,
        cellPadding: 3,
      },
    });

    y =
      doc.lastAutoTable.finalY + 10;

    // ==========================================================
    // Alert summary
    // ==========================================================

    doc.setFontSize(13);
    doc.setFont(
      "helvetica",
      "bold"
    );

    doc.text(
      "Alert Summary",
      14,
      y
    );

    y += 5;

    autoTable(doc, {
      startY: y,

      head: [
        [
          "Total Alerts",
          "Critical",
          "Warnings",
        ],
      ],

      body: [
        [
          String(
            reportAlerts.length
          ),
          String(criticalAlerts),
          String(warningAlerts),
        ],
      ],

      theme: "grid",

      headStyles: {
        fillColor: [27, 101, 138],
      },

      styles: {
        fontSize: 9,
        halign: "center",
      },
    });

    y =
      doc.lastAutoTable.finalY + 10;

    // ==========================================================
    // Telemetry records
    // ==========================================================

    if (y > pageHeight - 50) {
      doc.addPage();
      y = 20;
    }

    doc.setFontSize(13);
    doc.setFont(
      "helvetica",
      "bold"
    );

    doc.text(
      "Telemetry Records",
      14,
      y
    );

    y += 5;

    const telemetryRows =
      telemetry.map((record) => [
        formatDate(
          getTelemetryTimestamp(record)
        ),

        record.temperature != null
          ? `${record.temperature}`
          : "—",

        record.humidity != null
          ? `${record.humidity}`
          : "—",

        record.gasLevel ??
          record.gasRaw ??
          record.gas ??
          "—",

        record.battery != null
          ? `${record.battery}%`
          : "—",

        isValidTelemetryLocation(record)
          ? getTelemetryLocationName(record)
          : "Location unavailable",

        isValidTelemetryLocation(record)
          ? formatTelemetryCoordinates(record)
          : "GPS unavailable",

        formatTelemetryBoolean(
          record.gpsValid,
          "Valid",
          "Invalid"
        ),

        formatTelemetryTimeSource(
          record.timeSource
        ),
      ]);

    autoTable(doc, {
      startY: y,

      head: [
        [
          "Timestamp",
          "Temp C",
          "Humidity %",
          "Gas",
          "Battery",
          "Location",
          "Coordinates",
          "GPS",
          "Time Source",
        ],
      ],

      body:
        telemetryRows.length
          ? telemetryRows
          : [
              [
                "No telemetry available",
                "—",
                "—",
                "—",
                "—",
                "—",
              ],
            ],

      theme: "striped",

      headStyles: {
        fillColor: [27, 101, 138],
      },

      styles: {
        fontSize: 6,
        cellPadding: 1.5,
      },

      columnStyles: {
        0: {
          cellWidth: 26,
        },

        5: {
          cellWidth: 26,
        },

        6: {
          cellWidth: 26,
        },
      },
    });

    // ==========================================================
    // Alert details
    // ==========================================================

    if (reportAlerts.length) {
      y =
        doc.lastAutoTable.finalY +
        10;

      if (y > pageHeight - 45) {
        doc.addPage();
        y = 20;
      }

      doc.setFontSize(13);
      doc.setFont(
        "helvetica",
        "bold"
      );

      doc.text(
        "Alert Details",
        14,
        y
      );

      y += 5;

      autoTable(doc, {
        startY: y,

        head: [
          [
            "Time",
            "Type",
            "Severity",
            "Status",
            "Value",
          ],
        ],

        body: reportAlerts.map(
          (alert) => [
            formatDate(
              alert.createdAt
            ),

            alert.type
              ?.replace(
                /_/g,
                " "
              ) || "Alert",

            alert.severity ||
              "—",

            alert.status ||
              "—",

            alert.value ??
              alert.threshold
                ?.limit ??
              "—",
          ]
        ),

        theme: "striped",

        headStyles: {
          fillColor: [
            27,
            101,
            138,
          ],
        },

        styles: {
          fontSize: 7.5,
          cellPadding: 2,
        },
      });
    }

    // ==========================================================
    // Footer on every page
    // ==========================================================

    const totalPages =
      doc.getNumberOfPages();

    for (
      let page = 1;
      page <= totalPages;
      page += 1
    ) {
      doc.setPage(page);

      doc.setDrawColor(
        220,
        220,
        220
      );

      doc.line(
        14,
        pageHeight - 14,
        pageWidth - 14,
        pageHeight - 14
      );

      doc.setFontSize(7.5);
      doc.setTextColor(
        100,
        116,
        139
      );

      doc.text(
        "AgriTrace - Farm-to-Fork Traceability",
        14,
        pageHeight - 8
      );

      doc.text(
        `Page ${page} of ${totalPages}`,
        pageWidth - 14,
        pageHeight - 8,
        {
          align: "right",
        }
      );
    }

    const identifier =
      reportType ===
      REPORT_TYPES.SHIPMENT
        ? selectedShipmentId
        : selectedDeviceId;

    const cleanIdentifier =
      String(
        identifier || "report"
      ).replace(
        /[^a-zA-Z0-9-_]/g,
        "_"
      );

    doc.save(
      `AgriTrace_${cleanIdentifier}_${dateRange}_Report.pdf`
    );
  };

  // ============================================================
  // Loading
  // ============================================================

  if (initialLoading) {
    return (
      <div className="reports-loading">
        <div className="reports-loader" />
        <h3>Loading report data...</h3>
        <p>
          Fetching shipments and devices
          from AgriTrace.
        </p>

        <style>{`
          .reports-loading {
            min-height: 420px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 10px;
            color: var(--text);
          }

          .reports-loading p {
            color: var(--text-muted);
            margin: 0;
          }

          .reports-loader {
            width: 38px;
            height: 38px;
            border: 4px solid var(--border);
            border-top-color: #1b658a;
            border-radius: 50%;
            animation: reportsSpin .8s linear infinite;
          }

          @keyframes reportsSpin {
            to {
              transform: rotate(360deg);
            }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="page-container reports-page">
      <style>{`

        /* ====================================================
           Header
        ==================================================== */

        .reports-page {
          padding-bottom: 40px;
        }

        .reports-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 20px;
          margin-bottom: 22px;
        }

        .reports-header h1 {
          margin: 0 0 6px;
          color: var(--text);
        }

        .reports-header p {
          margin: 0;
          color: var(--text-muted);
          font-size: 13px;
        }

        .reports-header-badge {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 9px 13px;
          background: rgba(16,185,129,.1);
          color: #059669;
          border: 1px solid rgba(16,185,129,.22);
          border-radius: 9px;
          font-size: 12px;
          font-weight: 700;
        }

        /* ====================================================
           Error
        ==================================================== */

        .reports-error {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 15px;
          margin-bottom: 18px;
          border-radius: 10px;
          background: rgba(239,68,68,.08);
          border: 1px solid rgba(239,68,68,.2);
          color: #dc2626;
          font-size: 13px;
        }

        /* ====================================================
           Builder
        ==================================================== */

        .report-builder {
          background: var(--card-bg);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 22px;
          margin-bottom: 22px;
        }

        .report-builder-head {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 20px;
        }

        .report-builder-icon {
          width: 42px;
          height: 42px;
          border-radius: 11px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(27,101,138,.1);
          color: #1b658a;
          font-size: 18px;
        }

        .report-builder-head h3 {
          margin: 0 0 3px;
          color: var(--text);
          font-size: 16px;
        }

        .report-builder-head p {
          margin: 0;
          color: var(--text-muted);
          font-size: 12px;
        }

        .report-builder-grid {
          display: grid;
          grid-template-columns:
            repeat(3, minmax(0, 1fr));
          gap: 16px;
        }

        .report-field {
          display: flex;
          flex-direction: column;
          gap: 7px;
        }

        .report-field label {
          font-size: 12px;
          font-weight: 700;
          color: var(--text);
        }

        .report-field select {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid var(--border);
          border-radius: 9px;
          background: var(--bg-secondary);
          color: var(--text);
          outline: none;
          font-size: 13px;
        }

        .report-field select:focus {
          border-color: #1b658a;
        }

        .report-builder-actions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          margin-top: 20px;
          padding-top: 18px;
          border-top: 1px solid var(--border);
        }

        .report-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          border: none;
          border-radius: 9px;
          padding: 10px 17px;
          font-size: 12.5px;
          font-weight: 700;
          cursor: pointer;
          transition: .2s ease;
        }

        .report-btn:disabled {
          opacity: .55;
          cursor: not-allowed;
        }

        .report-btn-secondary {
          background: var(--bg-secondary);
          color: var(--text);
          border: 1px solid var(--border);
        }

        .report-btn-primary {
          background: #1b658a;
          color: white;
        }

        .report-btn-primary:hover:not(:disabled) {
          transform: translateY(-1px);
        }

        /* ====================================================
           Empty state
        ==================================================== */

        .report-empty {
          background: var(--card-bg);
          border: 1px dashed var(--border);
          border-radius: 14px;
          min-height: 280px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          text-align: center;
          padding: 30px;
        }

        .report-empty-icon {
          width: 58px;
          height: 58px;
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--bg-secondary);
          color: #1b658a;
          font-size: 23px;
          margin-bottom: 14px;
        }

        .report-empty h3 {
          margin: 0 0 6px;
          color: var(--text);
          font-size: 16px;
        }

        .report-empty p {
          margin: 0;
          max-width: 430px;
          color: var(--text-muted);
          font-size: 12.5px;
          line-height: 1.6;
        }

        /* ====================================================
           Preview
        ==================================================== */

        .report-preview-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin: 25px 0 13px;
        }

        .report-preview-head h3 {
          margin: 0;
          color: var(--text);
        }

        .report-preview-head span {
          font-size: 11px;
          color: #059669;
          background: rgba(16,185,129,.1);
          padding: 6px 10px;
          border-radius: 20px;
          font-weight: 700;
        }

        .report-info-card {
          background: var(--card-bg);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 20px;
          margin-bottom: 17px;
        }

        .report-info-card h4 {
          margin: 0 0 16px;
          color: var(--text);
          font-size: 14px;
        }

        .report-info-grid {
          display: grid;
          grid-template-columns:
            repeat(4, minmax(0,1fr));
          gap: 16px;
        }

        .report-info-item {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }

        .report-info-label {
          color: var(--text-muted);
          font-size: 11px;
        }

        .report-info-value {
          color: var(--text);
          font-size: 13px;
          font-weight: 700;
          word-break: break-word;
        }

        /* ====================================================
           Metrics
        ==================================================== */

        .report-metrics {
          display: grid;
          grid-template-columns:
            repeat(6, minmax(0,1fr));
          gap: 13px;
          margin-bottom: 18px;
        }

        .report-metric {
          background: var(--card-bg);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 15px;
          min-width: 0;
        }

        .report-metric-icon {
          width: 33px;
          height: 33px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 9px;
          background: var(--bg-secondary);
          color: #1b658a;
          margin-bottom: 12px;
        }

        .report-metric-value {
          color: var(--text);
          font-weight: 800;
          font-size: 18px;
          margin-bottom: 3px;
        }

        .report-metric-label {
          color: var(--text-muted);
          font-size: 10.5px;
        }

        /* ====================================================
           Table
        ==================================================== */

        .report-table-card {
          background: var(--card-bg);
          border: 1px solid var(--border);
          border-radius: 14px;
          overflow: hidden;
          margin-bottom: 18px;
        }

        .report-table-head {
          padding: 16px 18px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid var(--border);
        }

        .report-table-head h4 {
          margin: 0;
          color: var(--text);
          font-size: 14px;
        }

        .report-table-head span {
          color: var(--text-muted);
          font-size: 11px;
        }

        .report-table-scroll {
          overflow-x: auto;
          max-height: 440px;
          overflow-y: auto;
        }

        .report-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 11.5px;
        }

        .report-table th {
          position: sticky;
          top: 0;
          background: var(--bg-secondary);
          color: var(--text-muted);
          padding: 11px 14px;
          text-align: left;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: .04em;
          border-bottom: 1px solid var(--border);
          white-space: nowrap;
        }

        .report-table td {
          padding: 11px 14px;
          color: var(--text);
          border-bottom: 1px solid var(--border);
          white-space: nowrap;
        }

        .report-table-empty {
          text-align: center;
          padding: 30px !important;
          color: var(--text-muted) !important;
        }

        /* ====================================================
           Bottom download
        ==================================================== */

        .report-download-bar {
          background: var(--card-bg);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 17px 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 20px;
        }

        .report-download-bar h4 {
          margin: 0 0 4px;
          color: var(--text);
          font-size: 13px;
        }

        .report-download-bar p {
          margin: 0;
          color: var(--text-muted);
          font-size: 11.5px;
        }

        /* ====================================================
           Responsive
        ==================================================== */

        @media (max-width: 1200px) {
          .report-metrics {
            grid-template-columns:
              repeat(3, 1fr);
          }

          .report-info-grid {
            grid-template-columns:
              repeat(2, 1fr);
          }
        }

        @media (max-width: 900px) {
          .report-builder-grid {
            grid-template-columns: 1fr;
          }

          .reports-header {
            flex-direction: column;
          }
        }

        @media (max-width: 650px) {
          .report-metrics {
            grid-template-columns:
              repeat(2, 1fr);
          }

          .report-info-grid {
            grid-template-columns: 1fr;
          }

          .report-builder-actions,
          .report-download-bar {
            flex-direction: column;
            align-items: stretch;
          }

          .report-btn {
            width: 100%;
          }
        }

      `}</style>

      {/* Header */}

      <div className="reports-header">
        <div>
          <h1>Reports</h1>

          <p>
            Generate traceability and telemetry
            reports using real AgriTrace data.
          </p>
        </div>

        <div className="reports-header-badge">
          <FaFilePdf />
          PDF Reporting
        </div>
      </div>

      {/* Error */}

      {error && (
        <div className="reports-error">
          <FaTriangleExclamation />

          <span>{error}</span>
        </div>
      )}

      {/* ======================================================
          REPORT BUILDER
      ====================================================== */}

      <section className="report-builder">
        <div className="report-builder-head">
          <div className="report-builder-icon">
            <FaFileLines />
          </div>

          <div>
            <h3>Report Builder</h3>

            <p>
              Select the data you want to include
              in your report.
            </p>
          </div>
        </div>

        <div className="report-builder-grid">

          {/* Report Type */}

          <div className="report-field">
            <label>Report Type</label>

            <select
              value={reportType}
              onChange={(event) =>
                setReportType(
                  event.target.value
                )
              }
            >
              <option
                value={
                  REPORT_TYPES.SHIPMENT
                }
              >
                Shipment Traceability
              </option>

              <option
                value={
                  REPORT_TYPES.DEVICE
                }
              >
                Device Telemetry
              </option>
            </select>
          </div>

          {/* Entity */}

          {reportType ===
          REPORT_TYPES.SHIPMENT ? (
            <div className="report-field">
              <label>Shipment</label>

              <select
                value={
                  selectedShipmentId
                }
                onChange={(event) =>
                  setSelectedShipmentId(
                    event.target.value
                  )
                }
              >
                {shipments.length === 0 && (
                  <option value="">
                    No shipments available
                  </option>
                )}

                {shipments.map(
                  (shipment) => {
                    const id =
                      getShipmentId(
                        shipment
                      );

                    return (
                      <option
                        key={id}
                        value={id}
                      >
                        {getShipmentName(
                          shipment
                        )}{" "}
                        • {id}
                      </option>
                    );
                  }
                )}
              </select>
            </div>
          ) : (
            <div className="report-field">
              <label>Device</label>

              <select
                value={
                  selectedDeviceId
                }
                onChange={(event) =>
                  setSelectedDeviceId(
                    event.target.value
                  )
                }
              >
                {devices.length === 0 && (
                  <option value="">
                    No devices available
                  </option>
                )}

                {devices.map(
                  (device) => {
                    const id =
                      getDeviceId(device);

                    return (
                      <option
                        key={id}
                        value={id}
                      >
                        {id}
                        {device.status
                          ? ` • ${device.status}`
                          : ""}
                      </option>
                    );
                  }
                )}
              </select>
            </div>
          )}

          {/* Date */}

          <div className="report-field">
            <label>Report Period</label>

            <select
              value={dateRange}
              onChange={(event) =>
                setDateRange(
                  event.target.value
                )
              }
            >
              {Object.entries(
                DATE_RANGES
              ).map(
                ([value, config]) => (
                  <option
                    value={value}
                    key={value}
                  >
                    {config.label}
                  </option>
                )
              )}
            </select>
          </div>
        </div>

        <div className="report-builder-actions">
          <button
            type="button"
            className="report-btn report-btn-secondary"
            onClick={loadOptions}
            disabled={generating}
          >
            <FaRotate />
            Refresh Data
          </button>

          <button
            type="button"
            className="report-btn report-btn-primary"
            onClick={generateReport}
            disabled={
              generating ||
              (reportType ===
                REPORT_TYPES.SHIPMENT &&
                !selectedShipmentId) ||
              (reportType ===
                REPORT_TYPES.DEVICE &&
                !selectedDeviceId)
            }
          >
            <FaFileLines />

            {generating
              ? "Generating..."
              : "Generate Report"}
          </button>
        </div>
      </section>

      {/* ======================================================
          EMPTY STATE
      ====================================================== */}

      {!reportReady && (
        <section className="report-empty">
          <div className="report-empty-icon">
            <FaFilePdf />
          </div>

          <h3>
            No report generated yet
          </h3>

          <p>
            Select a shipment or IoT device,
            choose a reporting period and click
            Generate Report. AgriTrace will fetch
            the real telemetry and alert data
            from the backend.
          </p>
        </section>
      )}

      {/* ======================================================
          REPORT PREVIEW
      ====================================================== */}

      {reportReady && (
        <>
          <div className="report-preview-head">
            <h3>Report Preview</h3>

            <span>
              Real backend data
            </span>
          </div>

          {/* Information */}

          <section className="report-info-card">
            <h4>
              {reportType ===
              REPORT_TYPES.SHIPMENT
                ? "Shipment Information"
                : "Device Information"}
            </h4>

            <div className="report-info-grid">

              {reportType ===
              REPORT_TYPES.SHIPMENT ? (
                <>
                  <div className="report-info-item">
                    <span className="report-info-label">
                      Shipment
                    </span>

                    <span className="report-info-value">
                      {getShipmentName(
                        selectedShipment
                      )}
                    </span>
                  </div>

                  <div className="report-info-item">
                    <span className="report-info-label">
                      Shipment ID
                    </span>

                    <span className="report-info-value">
                      {
                        selectedShipmentId
                      }
                    </span>
                  </div>

                  <div className="report-info-item">
                    <span className="report-info-label">
                      Product
                    </span>

                    <span className="report-info-value">
                      {getShipmentProduct(
                        selectedShipment
                      )}
                    </span>
                  </div>

                  <div className="report-info-item">
                    <span className="report-info-label">
                      Status
                    </span>

                    <span className="report-info-value">
                      {selectedShipment
                        ?.status || "—"}
                    </span>
                  </div>

                  <div className="report-info-item">
                    <span className="report-info-label">
                      Origin
                    </span>

                    <span className="report-info-value">
                      {String(
                        getShipmentOrigin(
                          selectedShipment
                        )
                      )}
                    </span>
                  </div>

                  <div className="report-info-item">
                    <span className="report-info-label">
                      Destination
                    </span>

                    <span className="report-info-value">
                      {String(
                        getShipmentDestination(
                          selectedShipment
                        )
                      )}
                    </span>
                  </div>

                  <div className="report-info-item">
                    <span className="report-info-label">
                      Assigned Device
                    </span>

                    <span className="report-info-value">
                      {getAssignedDeviceId(
                        selectedShipment
                      ) || "—"}
                    </span>
                  </div>

                  <div className="report-info-item">
                    <span className="report-info-label">
                      Report Period
                    </span>

                    <span className="report-info-value">
                      {
                        DATE_RANGES[
                          dateRange
                        ]?.label
                      }
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div className="report-info-item">
                    <span className="report-info-label">
                      Device ID
                    </span>

                    <span className="report-info-value">
                      {selectedDeviceId}
                    </span>
                  </div>

                  <div className="report-info-item">
                    <span className="report-info-label">
                      Status
                    </span>

                    <span className="report-info-value">
                      {selectedDevice
                        ?.status || "—"}
                    </span>
                  </div>

                  <div className="report-info-item">
                    <span className="report-info-label">
                      Firmware
                    </span>

                    <span className="report-info-value">
                      {selectedDevice
                        ?.firmwareVersion ||
                        "—"}
                    </span>
                  </div>

                  <div className="report-info-item">
                    <span className="report-info-label">
                      Last Seen
                    </span>

                    <span className="report-info-value">
                      {formatDate(
                        selectedDevice
                          ?.lastSeenAt
                      )}
                    </span>
                  </div>
                </>
              )}
            </div>
          </section>

          {/* Metrics */}

          <section className="report-metrics">

            <div className="report-metric">
              <div className="report-metric-icon">
                <FaClock />
              </div>

              <div className="report-metric-value">
                {stats.count}
              </div>

              <div className="report-metric-label">
                Telemetry Readings
              </div>
            </div>

            <div className="report-metric">
              <div className="report-metric-icon">
                <FaTemperatureHalf />
              </div>

              <div className="report-metric-value">
                {stats.avgTemperature !==
                null
                  ? `${formatNumber(
                      stats.avgTemperature
                    )}°C`
                  : "—"}
              </div>

              <div className="report-metric-label">
                Average Temperature
              </div>
            </div>

            <div className="report-metric">
              <div className="report-metric-icon">
                <FaDroplet />
              </div>

              <div className="report-metric-value">
                {stats.avgHumidity !==
                null
                  ? `${formatNumber(
                      stats.avgHumidity
                    )}%`
                  : "—"}
              </div>

              <div className="report-metric-label">
                Average Humidity
              </div>
            </div>

            <div className="report-metric">
              <div className="report-metric-icon">
                <FaGasPump />
              </div>

              <div className="report-metric-value">
                {stats.maxGas !== null
                  ? formatNumber(
                      stats.maxGas,
                      0
                    )
                  : "—"}
              </div>

              <div className="report-metric-label">
                Maximum Gas Response
              </div>
            </div>

            <div className="report-metric">
              <div className="report-metric-icon">
                <FaBatteryThreeQuarters />
              </div>

              <div className="report-metric-value">
                {stats.latestBattery !==
                null
                  ? `${formatNumber(
                      stats.latestBattery,
                      0
                    )}%`
                  : "—"}
              </div>

              <div className="report-metric-label">
                Latest Battery
              </div>
            </div>

            <div className="report-metric">
              <div className="report-metric-icon">
                <FaTriangleExclamation />
              </div>

              <div className="report-metric-value">
                {reportAlerts.length}
              </div>

              <div className="report-metric-label">
                Alerts
              </div>
            </div>
          </section>

          {/* Telemetry table */}

          <section className="report-table-card">
            <div className="report-table-head">
              <h4>
                Telemetry Records
              </h4>

              <span>
                {telemetry.length} readings
              </span>
            </div>

            <div className="report-table-scroll">
              <table className="report-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Temperature</th>
                    <th>Humidity</th>
                    <th>Gas Response</th>
                    <th>Battery</th>
                    <th>Location</th>
                    <th>Coordinates</th>
                    <th>GPS</th>
                    <th>Time Source</th>
                  </tr>
                </thead>

                <tbody>
                  {telemetry.length ===
                  0 ? (
                    <tr>
                      <td
                        colSpan="9"
                        className="report-table-empty"
                      >
                        No telemetry was
                        recorded during this
                        reporting period.
                      </td>
                    </tr>
                  ) : (
                    telemetry.map(
                      (
                        record,
                        index
                      ) => (
                        <tr
                          key={
                            record._id ||
                            `${getTelemetryTimestamp(
                              record
                            )}-${index}`
                          }
                        >
                          <td>
                            {formatDate(
                              getTelemetryTimestamp(
                                record
                              )
                            )}
                          </td>

                          <td>
                            {record.temperature !=
                            null
                              ? `${record.temperature} °C`
                              : "—"}
                          </td>

                          <td>
                            {record.humidity !=
                            null
                              ? `${record.humidity}%`
                              : "—"}
                          </td>

                          <td>
                            {record.gasLevel ??
                              record.gasRaw ??
                              record.gas ??
                              "—"}
                          </td>

                          <td>
                            {record.battery !=
                            null
                              ? `${record.battery}%`
                              : "—"}
                          </td>

                          <td>
                            {isValidTelemetryLocation(
                              record
                            ) ? (
                              <>
                                <FaLocationDot />{" "}
                                {getTelemetryLocationName(
                                  record
                                )}
                              </>
                            ) : (
                              "Location unavailable"
                            )}
                          </td>

                          <td>
                            {isValidTelemetryLocation(
                              record
                            )
                              ? formatTelemetryCoordinates(
                                  record
                                )
                              : "GPS unavailable"}
                          </td>

                          <td>
                            {formatTelemetryBoolean(
                              record.gpsValid,
                              "Valid",
                              "Invalid"
                            )}
                          </td>

                          <td>
                            {formatTelemetryTimeSource(
                              record.timeSource
                            )}
                          </td>
                        </tr>
                      )
                    )
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Alerts */}

          <section className="report-table-card">
            <div className="report-table-head">
              <h4>
                Alerts During Period
              </h4>

              <span>
                {criticalAlerts} critical
              </span>
            </div>

            <div className="report-table-scroll">
              <table className="report-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Alert</th>
                    <th>Severity</th>
                    <th>Status</th>
                    <th>Value</th>
                  </tr>
                </thead>

                <tbody>
                  {reportAlerts.length ===
                  0 ? (
                    <tr>
                      <td
                        colSpan="5"
                        className="report-table-empty"
                      >
                        No alerts found for
                        this report.
                      </td>
                    </tr>
                  ) : (
                    reportAlerts.map(
                      (
                        alert,
                        index
                      ) => (
                        <tr
                          key={
                            alert.alertId ||
                            alert._id ||
                            index
                          }
                        >
                          <td>
                            {formatDate(
                              alert.createdAt
                            )}
                          </td>

                          <td>
                            {alert.type
                              ?.replace(
                                /_/g,
                                " "
                              ) ||
                              "Alert"}
                          </td>

                          <td>
                            {alert.severity ||
                              "—"}
                          </td>

                          <td>
                            {alert.status ||
                              "—"}
                          </td>

                          <td>
                            {alert.value ??
                              alert
                                .threshold
                                ?.limit ??
                              "—"}
                          </td>
                        </tr>
                      )
                    )
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Download */}

          <section className="report-download-bar">
            <div>
              <h4>
                AgriTrace PDF Report
              </h4>

              <p>
                Includes shipment/device
                information, telemetry
                statistics, sensor records
                and alert history.
              </p>
            </div>

            <button
              type="button"
              className="report-btn report-btn-primary"
              onClick={downloadPDF}
            >
              <FaDownload />
              Download PDF
            </button>
          </section>
        </>
      )}
    </div>
  );
};

export default Reports;