import {
  Navigate,
  Route,
  Routes,
} from "react-router-dom";

import AppLayout from "../components/layout/AppLayout";

import ProtectedRoutes from "./ProtectedRoutes";

import Login from "../pages/auth/Login";
import Register from "../pages/auth/Register";

import Landing from "../pages/Landing";

import Dashboard from "../pages/Dashboard";

import CreateShipment from "../pages/shipments/CreateShipment";
import ActiveShipments from "../pages/shipments/ActiveShipments";
import ShipmentHistory from "../pages/shipments/ShipmentHistory";
import ShipmentDetails from "../pages/shipments/ShipmentDetails";

import DeviceList from "../pages/devices/DeviceList";
import AssignDevice from "../pages/devices/AssignDevice";

import Monitoring from "../pages/Monitoring";
import Traceability from "../pages/Traceability";
import Alerts from "../pages/Alerts";
import Analytics from "../pages/Analytics";
import Reports from "../pages/Reports";
import Profile from "../pages/Profile";

import Marketplace from "../pages/marketplace/Marketplace";
import SmartRoute from "../pages/routes/SmartRoute";

import PublicTrace from "../pages/PublicTrace";

const AppRoutes = () => {
  return (
    <Routes>
      {/* Public landing page */}
      <Route path="/" element={<Landing />} />

      {/* Public authentication */}
      <Route path="/login" element={<Login />} />

      <Route
        path="/register"
        element={<Register />}
      />

      {/* Public consumer trace */}
      <Route
        path="/trace"
        element={<PublicTrace />}
      />

      <Route
        path="/trace/:trackingId"
        element={<PublicTrace />}
      />

      {/* Protected application */}
      <Route element={<ProtectedRoutes />}>
        <Route element={<AppLayout />}>
          <Route
            path="/dashboard"
            element={<Dashboard />}
          />

          {/* Shipments */}

          <Route
            path="/shipments/create"
            element={<CreateShipment />}
          />

          <Route
            path="/shipments/active"
            element={<ActiveShipments />}
          />

          <Route
            path="/shipments/history"
            element={<ShipmentHistory />}
          />

          <Route
            path="/shipments/:id"
            element={<ShipmentDetails />}
          />

          {/* Devices */}

          <Route
            path="/devices"
            element={<DeviceList />}
          />

          <Route
            path="/devices/assign"
            element={<AssignDevice />}
          />

          {/* Monitoring */}

          <Route
            path="/monitoring"
            element={<Monitoring />}
          />

          {/* Traceability */}

          <Route
            path="/traceability"
            element={<Traceability />}
          />

          {/* Alerts */}

          <Route
            path="/alerts"
            element={<Alerts />}
          />

          {/* Analytics */}

          <Route
            path="/analytics"
            element={<Analytics />}
          />

          {/* Reports */}

          <Route
            path="/reports"
            element={<Reports />}
          />

          {/* Profile */}

          <Route
            path="/profile"
            element={<Profile />}
          />

          {/* Marketplace */}

          <Route
            path="/marketplace"
            element={<Marketplace />}
          />

          {/* Smart Route */}

          <Route
            path="/routes/smart"
            element={<SmartRoute />}
          />
        </Route>
      </Route>

      {/* 404 */}
      <Route
        path="*"
        element={
          <Navigate
            to="/dashboard"
            replace
          />
        }
      />
    </Routes>
  );
};

export default AppRoutes;