import { useEffect, useState } from "react";

import {
  NavLink,
  useLocation,
} from "react-router-dom";

import { useAuth } from "../../context/AuthContext";

const Role = Object.freeze({
  FARMER: "FARMER",
  TRANSPORTER: "TRANSPORTER",
  WAREHOUSE: "WAREHOUSE",
  RETAILER: "RETAILER",
  ADMIN: "ADMIN",
});

function hasRole(profile, roles) {
  if (!profile?.role) return false;
  return roles.includes(profile.role);
}

const Sidebar = ({
  onCollapse,
}) => {
  const location = useLocation();
  const { profile } = useAuth();
  const role = profile?.role ?? null;
  const isAdmin = role === Role.ADMIN;
  const isFarmer = role === Role.FARMER;
  const isTransporter = role === Role.TRANSPORTER;
  const isWarehouse = role === Role.WAREHOUSE;
  const isRetailer = role === Role.RETAILER;

  const shipmentRouteOpen = location.pathname.startsWith("/shipments");
  const deviceRouteOpen = location.pathname.startsWith("/devices");

  const [shipmentOpen, setShipmentOpen] = useState(shipmentRouteOpen);
  const [deviceOpen, setDeviceOpen] = useState(deviceRouteOpen);

  useEffect(() => {
    if (shipmentRouteOpen) setShipmentOpen(true);
    if (deviceRouteOpen) setDeviceOpen(true);
  }, [shipmentRouteOpen, deviceRouteOpen]);

  const showCreateShipment = isFarmer || isAdmin;
  const showAssignDevice = isFarmer || isAdmin;
  const showSmartRoute = isTransporter || isAdmin;
  const showMarketplace = isFarmer || isWarehouse || isRetailer || isAdmin;
  const showAnalytics = isAdmin || true;
  const showReports = isAdmin || true;

  return (
    <aside id="sidebar" className="sidebar">
      <div className="sidebar-head">
        <div className="brand">
          <span className="brand-mark">
            <i className="fa-solid fa-seedling"></i>
          </span>
          <span className="brand-text">
            AgriTrace
          </span>
        </div>

        <button
          id="sidebarCollapseBtn"
          className="icon-btn ghost sidebar-collapse-btn"
          onClick={onCollapse}
          aria-label="Collapse sidebar"
        >
          <i className="fa-solid fa-angles-left"></i>
        </button>
      </div>

      <nav className="nav">
        <div className="nav-group">
          <NavLink
            to="/dashboard"
            className={({ isActive }) =>
              `nav-item ${isActive ? "active-page" : ""}`
            }
          >
            <i className="fa-solid fa-gauge-high"></i>
            <span>Dashboard</span>
          </NavLink>
        </div>

        <div
          className={`nav-group has-children ${
            shipmentOpen ? "open" : ""
          }`}
        >
          <button
            className="nav-item nav-parent"
            type="button"
            onClick={() => setShipmentOpen((open) => !open)}
            aria-expanded={shipmentOpen}
          >
            <i className="fa-solid fa-box-open"></i>
            <span>Shipments</span>
            <i className="fa-solid fa-chevron-down chev"></i>
          </button>

          <div className="nav-children">
            {showCreateShipment && (
              <NavLink
                to="/shipments/create"
                className={({ isActive }) =>
                  `nav-item nav-child ${isActive ? "active-page" : ""}`
                }
              >
                <span>Create Shipment</span>
              </NavLink>
            )}

            <NavLink
              to="/shipments/active"
              className={({ isActive }) =>
                `nav-item nav-child ${isActive ? "active-page" : ""}`
              }
            >
              <span>Active Shipments</span>
            </NavLink>

            <NavLink
              to="/shipments/history"
              className={({ isActive }) =>
                `nav-item nav-child ${isActive ? "active-page" : ""}`
              }
            >
              <span>Shipment History</span>
            </NavLink>
          </div>
        </div>

        <div
          className={`nav-group has-children ${
            deviceOpen ? "open" : ""
          }`}
        >
          <button
            className="nav-item nav-parent"
            type="button"
            onClick={() => setDeviceOpen((open) => !open)}
            aria-expanded={deviceOpen}
          >
            <i className="fa-solid fa-microchip"></i>
            <span>Devices</span>
            <i className="fa-solid fa-chevron-down chev"></i>
          </button>

          <div className="nav-children">
            <NavLink
              to="/devices"
              className={({ isActive }) =>
                `nav-item nav-child ${isActive ? "active-page" : ""}`
              }
            >
              <span>Device List</span>
            </NavLink>

            {showAssignDevice && (
              <NavLink
                to="/devices/assign"
                className={({ isActive }) =>
                  `nav-item nav-child ${isActive ? "active-page" : ""}`
                }
              >
                <span>Assign Device</span>
              </NavLink>
            )}
          </div>
        </div>

        <div className="nav-group">
          <NavLink
            to="/monitoring"
            className={({ isActive }) =>
              `nav-item ${isActive ? "active-page" : ""}`
            }
          >
            <i className="fa-solid fa-wave-square"></i>
            <span>Monitoring</span>
          </NavLink>

          <NavLink
            to="/traceability"
            className={({ isActive }) =>
              `nav-item ${isActive ? "active-page" : ""}`
            }
          >
            <i className="fa-solid fa-route"></i>
            <span>Traceability</span>
          </NavLink>

          <NavLink
            to="/alerts"
            className={({ isActive }) =>
              `nav-item ${isActive ? "active-page" : ""}`
            }
          >
            <i className="fa-solid fa-triangle-exclamation"></i>
            <span>Alerts</span>
          </NavLink>

          {showMarketplace && (
            <NavLink
              to="/marketplace"
              className={({ isActive }) =>
                `nav-item ${isActive ? "active-page" : ""}`
              }
            >
              <i className="fa-solid fa-store"></i>
              <span>Marketplace</span>
            </NavLink>
          )}

          {showSmartRoute && (
            <NavLink
              to="/routes/smart"
              className={({ isActive }) =>
                `nav-item ${isActive ? "active-page" : ""}`
              }
            >
              <i className="fa-solid fa-globe-with-compass"></i>
              <span>Smart Route</span>
            </NavLink>
          )}

          {showAnalytics && (
            <NavLink
              to="/analytics"
              className={({ isActive }) =>
                `nav-item ${isActive ? "active-page" : ""}`
              }
            >
              <i className="fa-solid fa-chart-line"></i>
              <span>Analytics</span>
            </NavLink>
          )}

          {showReports && (
            <NavLink
              to="/reports"
              className={({ isActive }) =>
                `nav-item ${isActive ? "active-page" : ""}`
              }
            >
              <i className="fa-solid fa-file-lines"></i>
              <span>Reports</span>
            </NavLink>
          )}

          <NavLink
            to="/profile"
            className={({ isActive }) =>
              `nav-item ${isActive ? "active-page" : ""}`
            }
          >
            <i className="fa-solid fa-circle-user"></i>
            <span>Profile</span>
          </NavLink>
        </div>
      </nav>

      <div className="sidebar-foot">
        <NavLink
          to="/trace"
          className={({ isActive }) =>
            `nav-item ${isActive ? "active-page" : ""}`
          }
        >
          <i className="fa-solid fa-qrcode"></i>
          <span>Consumer View</span>
        </NavLink>
        <div className="sidebar-tag">
          <i className="fa-solid fa-leaf"></i>
          <div>
            <strong>AgriTrace Demo Network</strong>
            <span>Smart India Hackathon MVP</span>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;