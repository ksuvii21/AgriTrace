import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";

import { useAuth } from "../context/AuthContext";

/* ---------- auth-aware destination ---------- */

// Signed-out visitors are sent to /login, keeping the page they wanted so
// Login can return them to it (it reads location.state.from.pathname).
// Signed-in visitors go straight to the in-app page.
const authLink = (isAuthenticated, authed, guest = "/login") =>
  isAuthenticated ? authed : { pathname: guest, state: { from: { pathname: authed } } };

/* ---------- shared ---------- */

// Matches the reference design's .fade-up / .fade-up.in pair: a 16px rise over
// 0.7s. framer-motion honours prefers-reduced-motion itself, so the reference's
// CSS media query isn't needed here.
const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: "easeOut" } },
};

function Reveal({ children, className = "" }) {
  return (
    <motion.div
      className={className}
      variants={fadeUp}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.2 }}
    >
      {children}
    </motion.div>
  );
}

/* ---------- Navbar ---------- */

function Navbar() {
  const { isAuthenticated } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 inset-x-0 z-50 transition-colors duration-300 ${
        scrolled ? "bg-paper/95 backdrop-blur shadow-sm" : ""
      }`}
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-4">
        <a href="#top" className="flex items-center gap-2">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M12 2C8 6 5 10 5 14a7 7 0 0014 0c0-4-3-8-7-12z" fill="#4C8C63" />
          </svg>
          <span className="font-serif text-lg tracking-tight">AgriTrace</span>
        </a>
        <div className="hidden md:flex gap-8 text-sm font-medium">
          <a href="#how" className="hover:text-leaf">How It Works</a>
          <a href="#technology" className="hover:text-leaf">Technology</a>
          <a href="#trace" className="hover:text-leaf">Traceability</a>
          <a href="#impact" className="hover:text-leaf">Impact</a>
          <a href="#for" className="hover:text-leaf">About</a>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to={authLink(isAuthenticated, "/shipments/active")}
            className="hidden sm:inline text-sm font-medium px-4 py-2 rounded-md border border-forest/30"
          >
            Track Shipment
          </Link>
          <Link
            to={authLink(isAuthenticated, "/dashboard")}
            className="text-sm font-semibold px-4 py-2 rounded-md bg-forest text-paper"
          >
            {isAuthenticated ? "Open Dashboard" : "Sign In"}
          </Link>
        </div>
      </div>
    </nav>
  );
}

/* ---------- Hero ---------- */

function Hero() {
  const { isAuthenticated } = useAuth();
  return (
    <header id="top" className="relative pt-36 pb-20 px-6 overflow-hidden">
      <div className="max-w-7xl mx-auto grid md:grid-cols-2 gap-12 items-center">
        <div>
          <p className="text-sm font-medium text-leaf mb-4">
            Built for smarter, safer and more transparent food supply chains.
          </p>
          <h1 className="font-serif text-5xl md:text-6xl leading-[1.05] text-forest">
            From farm to fork.
            <br />
            Every step, traceable.
          </h1>
          <p className="mt-6 text-lg text-ink/70 max-w-md">
            Smart IoT monitoring that protects food quality, tracks environmental
            conditions, and creates trustworthy records throughout the supply chain.
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <a
              href="#how"
              className="px-6 py-3 rounded-md bg-forest text-paper font-medium hover:bg-forest/90"
            >
              Explore AgriTrace
            </a>
            <Link
              to={authLink(isAuthenticated, "/shipments/active")}
              className="px-6 py-3 rounded-md border border-forest/30 font-medium hover:bg-forest/5"
            >
              Track a Shipment
            </Link>
          </div>
        </div>

        {/* Farm-to-fork visual: dashed route, edge device, and a packet
            travelling the line. SMIL (<animate>/<animateMotion>) is used
            rather than the reference's CSS offset-path, because offset-distance
            support is uneven and SMIL works in every target browser. */}
        <div className="relative">
          <svg viewBox="0 0 480 320" className="w-full h-auto">
            <defs>
              <path id="routePath" d="M50 160 H450" />
            </defs>

            <line
              x1="30" y1="160" x2="450" y2="160"
              stroke="#8A7458" strokeWidth="2" strokeDasharray="4 6"
            >
              <animate attributeName="stroke-dashoffset" from="0" to="-60" dur="3s" repeatCount="indefinite" />
            </line>

            <g fontFamily="Inter" fontSize="11" fill="#1B1B18">
              <circle cx="50" cy="160" r="7" fill="#4C8C63" /><text x="30" y="185">Farm</text>
              <circle cx="160" cy="160" r="7" fill="#4C8C63" /><text x="135" y="185">Storage</text>
              <circle cx="270" cy="160" r="7" fill="#8FBF8A" /><text x="235" y="185">Transport</text>
              <circle cx="380" cy="160" r="7" fill="#8FBF8A" /><text x="335" y="185">Distribution</text>
              <circle cx="450" cy="160" r="7" fill="#173C2E" /><text x="415" y="185">Consumer</text>
            </g>

            {/* device */}
            <g transform="translate(250,90)">
              <rect x="-22" y="-16" width="44" height="32" rx="6" fill="#173C2E" />
              <circle cx="0" cy="0" r="4" fill="#8FBF8A" />
            </g>
            <line x1="270" y1="106" x2="270" y2="153" stroke="#4C8C63" strokeWidth="1.5">
              <animate attributeName="stroke-dashoffset" from="0" to="-60" dur="3s" repeatCount="indefinite" />
            </line>

            {/* travel packet */}
            <circle r="5" fill="#173C2E">
              <animateMotion dur="4s" repeatCount="indefinite">
                <mpath href="#routePath" />
              </animateMotion>
            </circle>

            <g fontFamily="Inter" fontSize="10" fill="#4C8C63">
              <text x="290" y="70">32.1°C</text>
              <text x="290" y="84">76% RH</text>
              <text x="170" y="70">Gas 989</text>
              <text x="170" y="84">GPS Active</text>
              <text x="290" y="98">Device Online</text>
            </g>
          </svg>
        </div>
      </div>
    </header>
  );
}

/* ---------- Live status strip ---------- */

function LiveStatus() {
  return (
    <div className="border-y border-forest/10 bg-forest text-paper/90 py-3 overflow-hidden">
      <div className="max-w-7xl mx-auto flex flex-wrap gap-x-10 gap-y-2 px-6 text-xs md:text-sm font-medium justify-center">
        <span className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-sprout inline-block" />
          Device Online
        </span>
        <span>Environmental Monitoring Active</span>
        <span>GPS Tracking</span>
        <span>Secure Logging</span>
        <span>Offline Protection</span>
      </div>
    </div>
  );
}

/* ---------- Problem ---------- */

function ProblemSection() {
  return (
    <section className="py-24 px-6">
      <div className="max-w-7xl mx-auto grid md:grid-cols-2 gap-14 items-center">
        <div className="rounded-lg bg-soil/20 aspect-[4/3] flex items-center justify-center">
          <svg viewBox="0 0 200 150" className="w-3/4">
            <rect x="10" y="60" width="180" height="60" rx="6" fill="#8A7458" opacity=".3" />
            <rect x="30" y="40" width="50" height="80" rx="4" fill="#4C8C63" opacity=".5" />
            <rect x="100" y="55" width="70" height="65" rx="4" fill="#173C2E" opacity=".4" />
          </svg>
        </div>
        <Reveal>
          <h2 className="font-serif text-3xl md:text-4xl text-forest mb-6">
            Food shouldn't become invisible after it leaves the farm.
          </h2>
          <p className="text-ink/70 mb-8">
            Once a shipment leaves the field, conditions during storage and transport
            quietly shape its quality. Records get scattered across paper logs and
            disconnected systems, and connectivity gaps leave hours of history
            unrecorded.
          </p>
          <ul className="space-y-4">
            <li className="flex gap-3">
              <span className="text-leaf">—</span>
              <span>
                <strong>Environmental exposure:</strong> heat, humidity, and gas
                levels shift without anyone noticing.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="text-leaf">—</span>
              <span>
                <strong>Connectivity gaps:</strong> rural routes and cold storage
                often sit outside network coverage.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="text-leaf">—</span>
              <span>
                <strong>Fragmented traceability:</strong> no single, trustworthy
                record follows the shipment end to end.
              </span>
            </li>
          </ul>
        </Reveal>
      </div>
    </section>
  );
}

/* ---------- Device showcase ---------- */

function DeviceShowcase() {
  // Each sensor is an edge from the hub (x 180 or 320) out to a label.
  const edges = {
    left: [
      { y1: 100, x2: 70, y2: 60, tx: 10, ty: 55, label: "Temperature & Humidity" },
      { y1: 140, x2: 60, y2: 150, tx: 10, ty: 153, label: "Gas Monitoring" },
      { y1: 180, x2: 60, y2: 210, tx: 10, ty: 213, label: "GPS Tracking" },
      { y1: 220, x2: 70, y2: 270, tx: 20, ty: 285, label: "Local SD Storage" },
    ],
    right: [
      { y1: 100, x2: 430, y2: 60, tx: 345, ty: 55, label: "Cellular / Wi-Fi" },
      { y1: 140, x2: 440, y2: 150, tx: 360, ty: 153, label: "Tamper Detection" },
      { y1: 180, x2: 440, y2: 210, tx: 365, ty: 213, label: "Solar-Assisted Power" },
      { y1: 220, x2: 430, y2: 270, tx: 345, ty: 285, label: "RTC Timestamping" },
    ],
  };

  return (
    <section className="py-24 px-6 bg-forest text-paper">
      <div className="max-w-7xl mx-auto text-center mb-14">
        <h2 className="font-serif text-3xl md:text-4xl">One device. Continuous visibility.</h2>
      </div>
      <div className="max-w-4xl mx-auto relative">
        <svg viewBox="0 0 500 340" className="w-full h-auto">
          <rect x="180" y="90" width="140" height="160" rx="16" fill="#0F2A20" stroke="#4C8C63" strokeWidth="2" />
          <circle cx="250" cy="120" r="6" fill="#8FBF8A" />
          <rect x="205" y="150" width="90" height="50" rx="6" fill="#173C2E" />

          <g stroke="#4C8C63" strokeWidth="1" fontFamily="Inter" fontSize="11" fill="#F6F3EC">
            {edges.left.map((e) => (
              <g key={e.label}>
                <line x1="180" y1={e.y1} x2={e.x2} y2={e.y2} />
                <text x={e.tx} y={e.ty}>{e.label}</text>
              </g>
            ))}
            {edges.right.map((e) => (
              <g key={e.label}>
                <line x1="320" y1={e.y1} x2={e.x2} y2={e.y2} />
                <text x={e.tx} y={e.ty}>{e.label}</text>
              </g>
            ))}
          </g>
        </svg>
        <p className="text-center text-paper/60 text-sm mt-2">
          Local alert buzzer sounds when a threshold is crossed, even before the network responds.
        </p>
      </div>
    </section>
  );
}

/* ---------- Supply chain journey (how it works) ---------- */

function SupplyChainJourney() {
  const steps = [
    { n: "01", t: "Attach", d: "An AgriTrace node is assigned to a shipment before it leaves the farm." },
    { n: "02", t: "Monitor", d: "Sensors continuously observe temperature, humidity, gas, and location." },
    { n: "03", t: "Protect offline", d: "When connectivity disappears, readings are stored locally instead of lost." },
    { n: "04", t: "Synchronize", d: "When connectivity returns, stored telemetry syncs with the platform." },
    { n: "05", t: "Verify", d: "Integrity checks help confirm shipment records haven't been silently altered." },
    { n: "06", t: "Trace", d: "Stakeholders and consumers access shipment history through the platform and a QR code." },
  ];
  return (
    <section id="how" className="py-24 px-6">
      <div className="max-w-4xl mx-auto">
        <h2 className="font-serif text-3xl md:text-4xl text-forest mb-14 text-center">
          How AgriTrace works
        </h2>
        <div className="border-l-2 border-leaf/30 pl-8 space-y-12">
          {steps.map((s) => (
            <Reveal key={s.n}>
              <p className="text-sm text-leaf font-medium mb-1">{s.n} · {s.t}</p>
              <p className="text-ink/70">{s.d}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- Monitoring preview ---------- */

function MonitoringPreview() {
  return (
    <section className="py-24 px-6 bg-soil/10">
      <div className="max-w-7xl mx-auto">
        <h2 className="font-serif text-3xl md:text-4xl text-forest mb-3">
          See what's happening to your shipment — while it's happening.
        </h2>
        <p className="text-ink/60 mb-12 max-w-xl">
          A live operational view, not a simulated dashboard.
        </p>
        <div className="grid md:grid-cols-3 gap-6">
          <div className="bg-paper rounded-lg p-6 shadow-sm md:col-span-2">
            <p className="text-sm text-ink/50 mb-3">Temperature &amp; Humidity — last 6 hours</p>
            <svg viewBox="0 0 300 90" className="w-full h-24">
              <polyline
                points="0,60 40,55 80,40 120,45 160,30 200,35 240,25 280,32"
                fill="none" stroke="#4C8C63" strokeWidth="2"
              />
              <polyline
                points="0,75 40,70 80,72 120,66 160,68 200,60 240,64 280,58"
                fill="none" stroke="#8A7458" strokeWidth="2"
              />
            </svg>
            <div className="flex justify-between text-xs text-ink/50 mt-2">
              <span>32.1°C</span><span>76% RH</span><span>Gas 989</span>
            </div>
          </div>
          <div className="bg-paper rounded-lg p-6 shadow-sm space-y-3">
            <p className="text-sm text-ink/50">Shipment status</p>
            <p className="text-forest font-medium">In transit — Route 4B</p>
            <p className="text-sm text-ink/50 pt-2">Battery</p>
            <div className="h-2 bg-ink/10 rounded-full">
              <div className="h-2 bg-leaf rounded-full" style={{ width: "72%" }} />
            </div>
            <p className="text-sm text-ink/50 pt-2">GPS</p>
            <div className="rounded bg-forest/5 h-16 flex items-center justify-center text-xs text-ink/40">
              Map preview — 26.4°N, 80.9°E
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- Offline flow ---------- */

function OfflineFlow() {
  const flow = [
    { label: "Device Online", tone: "bg-leaf/15 text-forest" },
    { label: "Network Lost", tone: "bg-amber/15 text-amber" },
    { label: "Saved Locally", tone: "bg-soil/20" },
    { label: "Network Restored", tone: "bg-leaf/15 text-forest" },
    { label: "Cloud Record Updated", tone: "bg-forest text-paper" },
  ];
  return (
    <section className="py-24 px-6">
      <div className="max-w-3xl mx-auto text-center">
        <h2 className="font-serif text-3xl md:text-4xl text-forest mb-4">
          No network? No missing history.
        </h2>
        <p className="text-ink/70 mb-14">
          AgriTrace is built for agricultural and transport environments where
          continuous internet connectivity can't be assumed.
        </p>
        <div className="flex flex-wrap justify-center items-center gap-3 text-sm font-medium">
          {flow.map((f, i) => (
            <span key={f.label} className="flex items-center gap-3">
              <span className={`px-4 py-2 rounded-full ${f.tone}`}>{f.label}</span>
              {i < flow.length - 1 && <span className="text-ink/30">→</span>}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- Traceability / QR ---------- */

function TraceabilitySection() {
  const { isAuthenticated } = useAuth();
  const checkpoints = [
    { t: "Origin — Nashik Farm Collective", d: "Harvested, node attached" },
    { t: "Cold Storage — Pune", d: "4.2°C, 82% RH" },
    { t: "In Transit — Route 4B", d: "Integrity verified" },
    { t: "Distribution Center — Mumbai", d: "Awaiting delivery" },
  ];
  return (
    <section id="trace" className="py-24 px-6 bg-forest text-paper">
      <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-14 items-center">
        <div>
          <h2 className="font-serif text-3xl md:text-4xl mb-6">
            One scan. The story behind the shipment.
          </h2>
          <p className="text-paper/70 mb-8">
            A crate leaves with a QR code. Anyone who scans it — a distributor, a
            retailer, a shopper — sees exactly where it's been.
          </p>
          <Link
            to={authLink(isAuthenticated, "/shipments/active")}
            className="inline-block px-6 py-3 rounded-md bg-paper text-forest font-medium"
          >
            Track a Shipment
          </Link>
        </div>
        <div className="bg-paper text-ink rounded-lg p-6">
          <div className="flex items-center gap-4 mb-6">
            {/* A real scannable QR — `qrcode.react` is already a dependency.
                The reference's hand-drawn SVG only looked like a code and
                wouldn't scan, which matters on a traceability page. */}
            <QRCodeSVG
              value="AGT-20841"
              size={48}
              bgColor="#173C2E"
              fgColor="#F6F3EC"
              level="M"
            />
            <div>
              <p className="text-sm text-ink/50">Shipment</p>
              <p className="font-medium">AGT-20841</p>
            </div>
          </div>
          <ol className="space-y-4 border-l border-leaf/30 pl-5">
            {checkpoints.map((c) => (
              <li key={c.t}>
                <p className="text-sm font-medium">{c.t}</p>
                <p className="text-xs text-ink/50">{c.d}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

/* ---------- Technology architecture ---------- */

function TechnologyArchitecture() {
  const layers = [
    "Sensors",
    "ESP32 Edge Node",
    "Local Secure Storage",
    "Wi-Fi / Cellular → MQTT",
    "AgriTrace Backend & Integrity Layer",
    "Web & Mobile Applications",
  ];
  return (
    <section id="technology" className="py-24 px-6">
      <div className="max-w-3xl mx-auto text-center mb-14">
        <h2 className="font-serif text-3xl md:text-4xl text-forest">
          Built for the physical world.
        </h2>
      </div>
      <div className="max-w-xl mx-auto space-y-3">
        {layers.map((l, i) => (
          <div key={l}>
            <div
              className={`rounded-md py-3 text-center text-sm font-medium ${
                i === 4 ? "bg-forest text-paper" : "bg-soil/10"
              }`}
            >
              {l}
            </div>
            {i < layers.length - 1 && (
              <div className="h-6 flex justify-center">
                <div className="w-px bg-leaf/40" />
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------- Impact ---------- */

function ImpactSection() {
  const items = [
    { t: "Fewer visibility gaps", d: "Continuous readings replace scattered, manual logs." },
    { t: "Faster problem detection", d: "Environmental issues surface as they happen, not after delivery." },
    { t: "Accessible to smaller operators", d: "Traceability that doesn't require enterprise infrastructure." },
  ];
  return (
    <section id="impact" className="py-24 px-6 bg-soil/10">
      <div className="max-w-6xl mx-auto">
        <h2 className="font-serif text-3xl md:text-4xl text-forest mb-14 text-center">Impact</h2>
        <div className="grid md:grid-cols-3 gap-10 text-center">
          {items.map((i) => (
            <div key={i.t}>
              <p className="font-serif text-xl text-forest mb-2">{i.t}</p>
              <p className="text-ink/60 text-sm">{i.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- Stakeholder journey ---------- */

function StakeholderJourney() {
  const stakeholders = [
    { id: "farmer", name: "Farmer", body: "Shipment creation and origin traceability from the moment produce leaves the field." },
    { id: "warehouse", name: "Warehouse", body: "Storage condition monitoring and handoff records between facilities." },
    { id: "transporter", name: "Transporter", body: "Environmental monitoring and route visibility across the journey." },
    { id: "distributor", name: "Distributor", body: "Confirmed condition history before goods are accepted downstream." },
    { id: "retailer", name: "Retailer", body: "Verified quality records to support sourcing and shelf decisions." },
    { id: "consumer", name: "Consumer", body: "QR-based product journey information, from farm to the point of purchase." },
  ];
  const [active, setActive] = useState("farmer");
  const current = stakeholders.find((s) => s.id === active);

  return (
    <section id="for" className="py-24 px-6">
      <div className="max-w-4xl mx-auto text-center">
        <h2 className="font-serif text-3xl md:text-4xl text-forest mb-10">
          Who AgriTrace is for
        </h2>
        <div className="flex flex-wrap justify-center gap-2 mb-10">
          {stakeholders.map((s) => (
            <button
              key={s.id}
              onClick={() => setActive(s.id)}
              className={`px-4 py-2 rounded-full text-sm border border-forest/20 ${
                active === s.id ? "bg-forest text-paper" : ""
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
        <div className="text-left max-w-md mx-auto">
          <p className="font-serif text-xl text-forest mb-2">{current.heading}</p>
          <p className="text-ink/70">{current.body}</p>
        </div>
      </div>
    </section>
  );
}

/* ---------- CTA ---------- */

function CTA() {
  const { isAuthenticated } = useAuth();
  return (
    <section className="py-28 px-6 bg-forest text-paper text-center">
      <h2 className="font-serif text-4xl md:text-5xl mb-6 leading-tight">
        Trace the journey.
        <br />
        Protect the produce.
        <br />
        Trust the data.
      </h2>
      <p className="text-paper/70 max-w-md mx-auto mb-10">
        AgriTrace connects physical shipments with trustworthy digital records from
        origin to destination.
      </p>
      <div className="flex flex-wrap justify-center gap-4">
        <a href="#how" className="px-6 py-3 rounded-md bg-paper text-forest font-medium">
          Explore the Platform
        </a>
        <Link
          to={authLink(isAuthenticated, "/shipments/active")}
          className="px-6 py-3 rounded-md border border-paper/40 font-medium"
        >
          Track a Shipment
        </Link>
      </div>
    </section>
  );
}

/* ---------- Footer ---------- */

function Footer() {
  return (
    <footer
      className="py-14 px-6 border-t border-forest/10"
      style={{ paddingBottom: "calc(3.5rem + env(safe-area-inset-bottom, 0px))" }}
    >
      <div className="max-w-7xl mx-auto flex flex-wrap justify-between gap-8">
        <div className="max-w-xs">
          <p className="font-serif text-lg text-forest mb-2">AgriTrace</p>
          <p className="text-sm text-ink/60">
            Smart farm-to-fork traceability and environmental monitoring.
          </p>
        </div>
        <div className="flex gap-12 text-sm text-ink/60">
          <div className="space-y-2">
            <p className="text-ink font-medium">Platform</p>
            <p>Technology</p>
            <p>Traceability</p>
          </div>
          <div className="space-y-2">
            <p className="text-ink font-medium">Company</p>
            <p>About</p>
            <p>Contact</p>
            <p>Privacy</p>
          </div>
        </div>
      </div>
      <p className="max-w-7xl mx-auto mt-10 text-xs text-ink/40">
        AgriTrace — Smart Farm-to-Fork Traceability
      </p>
    </footer>
  );
}

/* ---------- Page ---------- */

export default function Landing() {
  return (
    <div className="landing-page font-sans">
      <Navbar />
      <Hero />
      <LiveStatus />
      <ProblemSection />
      <DeviceShowcase />
      <SupplyChainJourney />
      <MonitoringPreview />
      <OfflineFlow />
      <TraceabilitySection />
      <TechnologyArchitecture />
      <ImpactSection />
      <StakeholderJourney />
      <CTA />
      <Footer />
    </div>
  );
}