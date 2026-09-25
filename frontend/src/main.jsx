import React from "react";
import ReactDOM from "react-dom/client";

import { BrowserRouter } from "react-router-dom";

import App from "./App";
import "leaflet/dist/leaflet.css";
import { AuthProvider } from "./context/AuthContext";

// Tailwind must come first: the app's own stylesheets below override Tailwind's
// preflight/base layer, so existing pages keep their current appearance.
import "./styles/tailwind.css";
import "./styles/variables.css";
import "./styles/globals.css";
import "./styles/layout.css";
import "./styles/components.css";
import "./styles/pages.css";

ReactDOM.createRoot(
  document.getElementById("root")
).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);