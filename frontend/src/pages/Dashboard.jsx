import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";

import {
  FaBoxOpen,
  FaMicrochip,
  FaTriangleExclamation,
  FaTemperatureHalf,
  FaDroplet,
  FaArrowUp,
  FaArrowDown,
  FaMinus,
  FaPlugCircleXmark,
  FaEye,
  FaTruck,
} from "react-icons/fa6";

import { FaCheckCircle } from "react-icons/fa";

import { useAuth } from "../context/AuthContext";
import { getDashboardSummary } from "../api/dashboardApi";
import LoadingSpinner from "../components/common/LoadingSpinner";
import EmptyState from "../components/common/EmptyState";

function getShipmentBadgeClass(status) {
  switch (status) {
    case "In Transit":
      return "transit";

    case "Delivered":
      return "delivered";

    case "Delayed":
      return "delayed";

    case "Warehouse":
      return "warehouse";

    case "Alert":
      return "alert";

    default:
      return "transit";
  }
}

function MetricsSkeleton() {
  return (
    <>
      {[1, 2, 3, 4, 5].map((i) => (
        <article className="metric-card" key={i}>
          <div className={`metric-icon ${i % 2 === 0 ? "green" : "blue"}`}>
            <FaMinus />
          </div>
          <div className="metric-value">—</div>
          <div className="metric-label">Loading...</div>
          <div className="metric-trend flat">
            <FaMinus />
            <span>—</span>
          </div>
        </article>
      ))}
    </>
  );
}

function Dashboard() {
  const { user } = useAuth();
  const [dashboard, setDashboard] = useState(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState(null);
  const [metricsReady, setMetricsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      try {
        const data = await getDashboardSummary();
        if (cancelled) return;
        setDashboard(data);
        setMetricsReady(true);
      } catch (err) {
        if (cancelled) return;
        console.error("Failed to fetch dashboard data", err);
        setError(err);
      } finally {
        if (!cancelled) setInitialLoading(false);
      }
    };
    fetchData();
    return () => {
      cancelled = true;
    };
  }, []);

  const activeShipments = dashboard?.activeShipments ?? 0;
  const completedShipments = dashboard?.completedShipments ?? 0;
  const onlineDevices = dashboard?.onlineDevices ?? 0;
  const offlineDevices = dashboard?.offlineDevices ?? 0;
  const criticalAlerts = dashboard?.criticalAlerts ?? 0;
  const averageTemperature = dashboard?.averageTemperature;
  const averageHumidity = dashboard?.averageHumidity;
  const recentShipments = dashboard?.recentShipments || [];
  const recentAlerts = dashboard?.recentAlerts || [];

  const metrics = [
    {
      title: "Active Shipments",
      value: activeShipments,
      icon: <FaBoxOpen />,
      iconClass: "blue",
      trend: "+3 since yesterday",
      trendType: "up",
    },
    {
      title: "Completed Shipments",
      value: completedShipments,
      icon: <FaCheckCircle />,
      iconClass: "green",
      trend: "+12 this week",
      trendType: "up",
    },
    {
      title: "Online Devices",
      value: onlineDevices,
      icon: <FaMicrochip />,
      iconClass: "green",
      trend: "Stable",
      trendType: "flat",
    },
    {
      title: "Offline Devices",
      value: offlineDevices,
      icon: <FaPlugCircleXmark />,
      iconClass: "red",
      trend: "+1 since yesterday",
      trendType: "down",
    },
    {
      title: "Critical Alerts",
      value: criticalAlerts,
      icon: <FaTriangleExclamation />,
      iconClass: "amber",
      trend: "Needs attention",
      trendType: "down",
    },
  ];

  const renderTrendIcon = (type) => {
    if (type === "up") return <FaArrowUp />;
    if (type === "down") return <FaArrowDown />;
    return <FaMinus />;
  };

  const getAlertIconClass = (alert) => {
    if (alert.type === "DEVICE_OFFLINE" || alert.type === "LOW_BATTERY" || alert.type === "TAMPER_ALERT") {
      return "device";
    }
    if (alert.severity === "CRITICAL") return "critical";
    return "warning";
  };

  if (error && !dashboard) {
    return (
      <EmptyState
        message="Failed to load dashboard data"
        retry={() => window.location.reload()}
      />
    );
  }

  return (
    <section className="page active dashboard-page" id="page-dashboard">
      <section className="hero-banner">
        <div className="hero-text">
          <h2>Good Morning, {user?.displayName || "User"}</h2>
          <p>Here is what is happening across your supply chain today.</p>
        </div>
        <div className="hero-illustration">
          <FaTruck />
        </div>
      </section>

      <section className="metric-grid">
        {initialLoading && !metricsReady ? (
          <MetricsSkeleton />
        ) : (
          metrics.map((metric) => (
            <article className="metric-card" key={metric.title}>
              <div className={`metric-icon ${metric.iconClass}`}>
                {metric.icon}
              </div>
              <div className="metric-value">{metric.value}</div>
              <div className="metric-label">{metric.title}</div>
              <div className={`metric-trend ${metric.trendType}`}>
                {renderTrendIcon(metric.trendType)}
                <span>{metric.trend}</span>
              </div>
            </article>
          ))
        )}
      </section>

      <section className="grid-2col">
        <article className="card panel dashboard-environment-panel">
          <div className="panel-head">
            <h3>Environmental Overview</h3>
            <span className="muted-text">Network-wide sensor averages</span>
          </div>
          <div className="env-grid">
            <div className="env-item">
              <FaTemperatureHalf />
              <div className="env-value">
                {averageTemperature != null
                  ? `${averageTemperature.toFixed(1)}°C`
                  : "--"}
              </div>
              <div className="env-label">Average Temperature</div>
            </div>
            <div className="env-item">
              <FaDroplet />
              <div className="env-value">
                {averageHumidity != null
                  ? `${averageHumidity.toFixed(1)}%`
                  : "--"}
              </div>
              <div className="env-label">Average Humidity</div>
            </div>
          </div>
        </article>
      </section>

      <section className="grid-2col-wide">
        <article className="card panel recent-shipments-panel">
          <div className="panel-head dashboard-section-head">
            <h3>Recent Shipments</h3>
            <Link to="/shipments/active" className="link-btn">
              View all <span>→</span>
            </Link>
          </div>
          <div className="table-scroll">
            {initialLoading && recentShipments.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px" }}>
                <LoadingSpinner />
              </div>
            ) : recentShipments.length === 0 ? (
              <p style={{ textAlign: "center", padding: "20px", color: "var(--text-muted)" }}>
                No recent shipments
              </p>
            ) : (
              <table className="data-table dashboard-table">
                <thead>
                  <tr>
                    <th>Shipment ID</th>
                    <th>Product</th>
                    <th>Source</th>
                    <th>Destination</th>
                    <th>Device</th>
                    <th>Status</th>
                    <th>Updated</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {recentShipments.map((shipment) => (
                    <tr key={shipment.shipmentId || shipment.id}>
                      <td>
                        <span className="mono-id">
                          {shipment.name || shipment.shipmentId || shipment.id}
                        </span>
                      </td>
                      <td>{shipment.product || "—"}</td>
                      <td>{shipment.source || "—"}</td>
                      <td>{shipment.destination || "—"}</td>
                      <td>
                        {shipment.assignedDevice || shipment.device || "—"}
                      </td>
                      <td>
                        <span
                          className={`badge ${getShipmentBadgeClass(
                            shipment.status
                          )}`}
                        >
                          {shipment.status}
                        </span>
                      </td>
                      <td>
                        {shipment.updatedAt
                          ? new Date(shipment.updatedAt).toLocaleString()
                          : "—"}
                      </td>
                      <td>
                        <Link
                          to={`/shipments/${shipment.name || shipment.shipmentId || shipment.id}`}
                          className="icon-action"
                          title="View shipment"
                        >
                          <FaEye />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </article>

        <article className="card panel recent-alerts-panel">
          <div className="panel-head dashboard-section-head">
            <h3>Recent Alerts</h3>
            <Link to="/alerts" className="link-btn">
              View all <span>→</span>
            </Link>
          </div>
          <div className="alert-list">
            {initialLoading && recentAlerts.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px" }}>
                <LoadingSpinner />
              </div>
            ) : recentAlerts.length === 0 ? (
              <p style={{ textAlign: "center", padding: "20px", color: "var(--text-muted)" }}>
                No recent alerts
              </p>
            ) : (
              recentAlerts.map((alert) => {
                const iconClass = getAlertIconClass(alert);
                return (
                  <div className={`alert-row ${iconClass}`} key={alert.alertId || alert.id}>
                    <div className="ai">
                      {alert.type === "DEVICE_OFFLINE" || alert.type === "LOW_BATTERY" || alert.type === "TAMPER_ALERT" ? (
                        <FaMicrochip />
                      ) : (
                        <FaTriangleExclamation />
                      )}
                    </div>
                    <div className="alert-content">
                      <div className="alert-title">
                        {alert.type?.replace(/_/g, " ") || "Alert"}
                      </div>
                      <div className="alert-sub">
                        {alert.shipmentId || alert.deviceId || "—"} ·{" "}
                        {alert.value != null
                          ? alert.value
                          : alert.threshold?.limit ?? "—"}
                      </div>
                    </div>
                    <div className="alert-time">
                      {alert.createdAt
                        ? new Date(alert.createdAt).toLocaleString()
                        : "—"}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </article>
      </section>
    </section>
  );
}

export default Dashboard;
