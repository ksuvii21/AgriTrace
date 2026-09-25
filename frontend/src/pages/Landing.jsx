import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import {
  Thermometer, Droplets, Wind, MapPin, Battery, Wifi,
  ShieldAlert, Sun, Clock, HardDrive, QrCode, ArrowRight,
} from "lucide-react";

import { useAuth } from "../context/AuthContext";

/* ---------- auth-aware destination ---------- */

// Signed-out visitors are sent to /login, keeping the page they wanted so
// Login can return them to it (it reads location.state.from.pathname).
// Signed-in visitors go straight to the in-app page.
const authLink = (isAuthenticated, authed, guest = "/login") =>
  isAuthenticated ? authed : { pathname: guest, state: { from: { pathname: authed } } };

/* ---------- shared ---------- */

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } },
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
        scrolled ? "bg-[#F6F3EC]/95 backdrop-blur shadow-sm" : ""
      }`}
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-4">
        <a href="#top" className="flex items-center gap-2">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M12 2C8 6 5 10 5 14a7 7 0 0014 0c0-4-3-8-7-12z" fill="#4C8C63" />
          </svg>
          <span className="font-serif text-lg text-[#173C2E]">AgriTrace</span>
        </a>
        <div className="hidden md:flex gap-8 text-sm font-medium text-[#1B1B18]">
          <a href="#how" className="hover:text-[#4C8C63]">How It Works</a>
          <a href="#technology" className="hover:text-[#4C8C63]">Technology</a>
          <a href="#trace" className="hover:text-[#4C8C63]">Traceability</a>
          <a href="#impact" className="hover:text-[#4C8C63]">Impact</a>
          <a href="#for" className="hover:text-[#4C8C63]">About</a>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to={authLink(isAuthenticated, "/shipments/active")}
            className="hidden sm:inline text-sm font-medium px-4 py-2 rounded-md border border-[#173C2E]/30"
          >
            Track Shipment
          </Link>
          <Link
            to={authLink(isAuthenticated, "/dashboard")}
            className="text-sm font-semibold px-4 py-2 rounded-md bg-[#173C2E] text-[#F6F3EC]"
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
  const stages = ["Farm", "Storage", "Transport", "Distribution", "Consumer"];
  return (
    <header id="top" className="pt-36 pb-20 px-6">
      <div className="max-w-7xl mx-auto grid md:grid-cols-2 gap-12 items-center">
        <div>
          <p className="text-sm font-medium text-[#4C8C63] mb-4">
            Built for smarter, safer and more transparent food supply chains.
          </p>
          <h1 className="font-serif text-5xl md:text-6xl leading-[1.05] text-[#173C2E]">
            From farm to fork.
            <br />
            Every step, traceable.
          </h1>
          <p className="mt-6 text-lg text-[#1B1B18]/70 max-w-md">
            Smart IoT monitoring that protects food quality, tracks environmental
            conditions, and creates trustworthy records throughout the supply chain.
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <a href="#how" className="px-6 py-3 rounded-md bg-[#173C2E] text-[#F6F3EC] font-medium">
              Explore AgriTrace
            </a>
            <Link
              to={authLink(isAuthenticated, "/shipments/active")}
              className="px-6 py-3 rounded-md border border-[#173C2E]/30 font-medium"
            >
              Track a Shipment
            </Link>
          </div>
        </div>

        <div className="relative">
          <div className="flex justify-between items-center relative">
            <div className="absolute inset-x-0 top-1/2 h-px bg-[#8A7458]/40" />
            {stages.map((s, i) => (
              <div key={s} className="relative z-10 flex flex-col items-center gap-2">
                <span
                  className={`w-3 h-3 rounded-full ${i < 2 ? "bg-[#4C8C63]" : i < 4 ? "bg-[#8FBF8A]" : "bg-[#173C2E]"}`}
                />
                <span className="text-xs text-[#1B1B18]/70">{s}</span>
              </div>
            ))}
          </div>
          <div className="mt-10 rounded-lg border border-[#173C2E]/15 bg-white/40 p-5 grid grid-cols-2 gap-3 text-xs text-[#1B1B18]/70">
            <span className="flex items-center gap-1"><Thermometer size={14} />32.1°C</span>
            <span className="flex items-center gap-1"><Droplets size={14} />76% RH</span>
            <span className="flex items-center gap-1"><Wind size={14} />Gas 989</span>
            <span className="flex items-center gap-1"><MapPin size={14} />GPS Active</span>
            <span className="flex items-center gap-1"><Wifi size={14} />Device Online</span>
          </div>
        </div>
      </div>
    </header>
  );
}

/* ---------- Live status strip ---------- */

function LiveStatus() {
  const items = [
    "Device Online",
    "Environmental Monitoring Active",
    "GPS Tracking",
    "Secure Logging",
    "Offline Protection",
  ];
  return (
    <div className="border-y border-[#173C2E]/10 bg-[#173C2E] text-[#F6F3EC]/90 py-3">
      <div className="max-w-7xl mx-auto flex flex-wrap justify-center gap-x-10 gap-y-2 px-6 text-xs md:text-sm font-medium">
        {items.map((t, i) => (
          <span key={t} className="flex items-center gap-2">
            {i === 0 && <span className="w-2 h-2 rounded-full bg-[#8FBF8A] inline-block" />}
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ---------- Problem ---------- */

function ProblemSection() {
  const problems = [
    { title: "Environmental exposure", body: "Heat, humidity, and gas levels shift without anyone noticing." },
    { title: "Connectivity gaps", body: "Rural routes and cold storage often sit outside network coverage." },
    { title: "Fragmented traceability", body: "No single, trustworthy record follows the shipment end to end." },
  ];
  return (
    <section className="py-24 px-6">
      <div className="max-w-7xl mx-auto grid md:grid-cols-2 gap-14 items-center">
        <div className="rounded-lg bg-[#8A7458]/15 aspect-[4/3]" />
        <Reveal>
          <h2 className="font-serif text-3xl md:text-4xl text-[#173C2E] mb-6">
            Food shouldn't become invisible after it leaves the farm.
          </h2>
          <p className="text-[#1B1B18]/70 mb-8">
            Once a shipment leaves the field, conditions during storage and transport
            quietly shape its quality. Records scatter across paper logs and
            disconnected systems, and connectivity gaps leave hours of history
            unrecorded.
          </p>
          <ul className="space-y-4">
            {problems.map((p) => (
              <li key={p.title} className="flex gap-3">
                <span className="text-[#4C8C63]">—</span>
                <span>
                  <strong>{p.title}:</strong> {p.body}
                </span>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}

/* ---------- Device showcase ---------- */

function DeviceShowcase() {
  const left = [
    { icon: Thermometer, label: "Temperature & Humidity Monitoring" },
    { icon: Wind, label: "Gas Monitoring" },
    { icon: MapPin, label: "GPS Tracking" },
    { icon: HardDrive, label: "Local SD Storage" },
  ];
  const right = [
    { icon: Wifi, label: "Cellular / Wi-Fi Connectivity" },
    { icon: ShieldAlert, label: "Tamper Detection" },
    { icon: Sun, label: "Solar-Assisted Power" },
    { icon: Clock, label: "RTC Timestamping" },
  ];
  return (
    <section className="py-24 px-6 bg-[#173C2E] text-[#F6F3EC]">
      <div className="max-w-4xl mx-auto text-center mb-14">
        <h2 className="font-serif text-3xl md:text-4xl">One device. Continuous visibility.</h2>
      </div>
      <div className="max-w-4xl mx-auto grid grid-cols-3 gap-6 items-center">
        <ul className="space-y-6 text-sm text-right">
          {left.map(({ icon: Icon, label }) => (
            <li key={label} className="flex items-center justify-end gap-2">
              {label} <Icon size={16} className="text-[#8FBF8A]" />
            </li>
          ))}
        </ul>
        <div className="mx-auto w-28 h-40 rounded-2xl bg-[#0F2A20] border-2 border-[#4C8C63] flex items-start justify-center pt-6">
          <span className="w-2.5 h-2.5 rounded-full bg-[#8FBF8A]" />
        </div>
        <ul className="space-y-6 text-sm">
          {right.map(({ icon: Icon, label }) => (
            <li key={label} className="flex items-center gap-2">
              <Icon size={16} className="text-[#8FBF8A]" /> {label}
            </li>
          ))}
        </ul>
      </div>
      <p className="text-center text-[#F6F3EC]/60 text-sm mt-10">
        A local alert buzzer sounds when a threshold is crossed, even before the network responds.
      </p>
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
        <h2 className="font-serif text-3xl md:text-4xl text-[#173C2E] mb-14 text-center">
          How AgriTrace works
        </h2>
        <div className="border-l-2 border-[#4C8C63]/30 pl-8 space-y-12">
          {steps.map((s) => (
            <Reveal key={s.n}>
              <p className="text-sm text-[#4C8C63] font-medium mb-1">{s.n} · {s.t}</p>
              <p className="text-[#1B1B18]/70">{s.d}</p>
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
    <section className="py-24 px-6 bg-[#8A7458]/10">
      <div className="max-w-7xl mx-auto">
        <h2 className="font-serif text-3xl md:text-4xl text-[#173C2E] mb-3">
          See what's happening to your shipment — while it's happening.
        </h2>
        <p className="text-[#1B1B18]/60 mb-12 max-w-xl">
          A live operational view, not a simulated dashboard.
        </p>
        <div className="grid md:grid-cols-3 gap-6">
          <div className="bg-[#F6F3EC] rounded-lg p-6 shadow-sm md:col-span-2">
            <p className="text-sm text-[#1B1B18]/50 mb-3">Temperature & humidity — last 6 hours</p>
            <div className="h-24 flex items-end gap-1">
              {[40, 55, 45, 60, 50, 65, 58, 62].map((v, i) => (
                <div key={i} className="flex-1 bg-[#4C8C63]/60 rounded-t" style={{ height: `${v}%` }} />
              ))}
            </div>
            <div className="flex justify-between text-xs text-[#1B1B18]/50 mt-2">
              <span>32.1°C</span><span>76% RH</span><span>Gas 989</span>
            </div>
          </div>
          <div className="bg-[#F6F3EC] rounded-lg p-6 shadow-sm space-y-3">
            <p className="text-sm text-[#1B1B18]/50">Shipment status</p>
            <p className="text-[#173C2E] font-medium">In transit — Route 4B</p>
            <p className="text-sm text-[#1B1B18]/50 pt-2">Battery</p>
            <div className="h-2 bg-[#1B1B18]/10 rounded-full">
              <div className="h-2 bg-[#4C8C63] rounded-full" style={{ width: "72%" }} />
            </div>
            <p className="text-sm text-[#1B1B18]/50 pt-2">GPS</p>
            <div className="rounded bg-[#173C2E]/5 h-16 flex items-center justify-center text-xs text-[#1B1B18]/40">
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
    { label: "Device Online", tone: "bg-[#4C8C63]/15 text-[#173C2E]" },
    { label: "Network Lost", tone: "bg-[#B4772C]/15 text-[#B4772C]" },
    { label: "Saved Locally", tone: "bg-[#8A7458]/20 text-[#1B1B18]" },
    { label: "Network Restored", tone: "bg-[#4C8C63]/15 text-[#173C2E]" },
    { label: "Cloud Record Updated", tone: "bg-[#173C2E] text-[#F6F3EC]" },
  ];
  return (
    <section className="py-24 px-6">
      <div className="max-w-3xl mx-auto text-center">
        <h2 className="font-serif text-3xl md:text-4xl text-[#173C2E] mb-4">
          No network? No missing history.
        </h2>
        <p className="text-[#1B1B18]/70 mb-14">
          AgriTrace is built for agricultural and transport environments where
          continuous internet connectivity can't be assumed.
        </p>
        <div className="flex flex-wrap justify-center items-center gap-3 text-sm font-medium">
          {flow.map((f, i) => (
            <span key={f.label} className="flex items-center gap-3">
              <span className={`px-4 py-2 rounded-full ${f.tone}`}>{f.label}</span>
              {i < flow.length - 1 && <ArrowRight size={14} className="text-[#1B1B18]/30" />}
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
    <section id="trace" className="py-24 px-6 bg-[#173C2E] text-[#F6F3EC]">
      <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-14 items-center">
        <div>
          <h2 className="font-serif text-3xl md:text-4xl mb-6">
            One scan. The story behind the shipment.
          </h2>
          <p className="text-[#F6F3EC]/70 mb-8">
            A crate leaves with a QR code. Anyone who scans it — a distributor, a
            retailer, a shopper — sees exactly where it's been.
          </p>
          <Link
            to={authLink(isAuthenticated, "/shipments/active")}
            className="inline-block px-6 py-3 rounded-md bg-[#F6F3EC] text-[#173C2E] font-medium"
          >
            Track a Shipment
          </Link>
        </div>
        <div className="bg-[#F6F3EC] text-[#1B1B18] rounded-lg p-6">
          <div className="flex items-center gap-4 mb-6">
            <QrCode size={40} className="text-[#173C2E]" />
            <div>
              <p className="text-sm text-[#1B1B18]/50">Shipment</p>
              <p className="font-medium">AGT-20841</p>
            </div>
          </div>
          <ol className="space-y-4 border-l border-[#4C8C63]/30 pl-5">
            {checkpoints.map((c) => (
              <li key={c.t}>
                <p className="text-sm font-medium">{c.t}</p>
                <p className="text-xs text-[#1B1B18]/50">{c.d}</p>
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
        <h2 className="font-serif text-3xl md:text-4xl text-[#173C2E]">
          Built for the physical world.
        </h2>
      </div>
      <div className="max-w-xl mx-auto space-y-3">
        {layers.map((l, i) => (
          <div key={l}>
            <div
              className={`rounded-md py-3 text-center text-sm font-medium ${
                i === 4 ? "bg-[#173C2E] text-[#F6F3EC]" : "bg-[#8A7458]/10"
              }`}
            >
              {l}
            </div>
            {i < layers.length - 1 && (
              <div className="h-6 flex justify-center">
                <div className="w-px bg-[#4C8C63]/40" />
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
    <section id="impact" className="py-24 px-6 bg-[#8A7458]/10">
      <div className="max-w-6xl mx-auto">
        <h2 className="font-serif text-3xl md:text-4xl text-[#173C2E] mb-14 text-center">Impact</h2>
        <div className="grid md:grid-cols-3 gap-10 text-center">
          {items.map((i) => (
            <div key={i.t}>
              <p className="font-serif text-xl text-[#173C2E] mb-2">{i.t}</p>
              <p className="text-[#1B1B18]/60 text-sm">{i.d}</p>
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
        <h2 className="font-serif text-3xl md:text-4xl text-[#173C2E] mb-10">
          Who AgriTrace is for
        </h2>
        <div className="flex flex-wrap justify-center gap-2 mb-10">
          {stakeholders.map((s) => (
            <button
              key={s.id}
              onClick={() => setActive(s.id)}
              className={`px-4 py-2 rounded-full text-sm border border-[#173C2E]/20 ${
                active === s.id ? "bg-[#173C2E] text-[#F6F3EC]" : ""
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
        <div className="text-left max-w-md mx-auto">
          <p className="font-serif text-xl text-[#173C2E] mb-2">{current.name}</p>
          <p className="text-[#1B1B18]/70">{current.body}</p>
        </div>
      </div>
    </section>
  );
}

/* ---------- CTA ---------- */

function CTA() {
  const { isAuthenticated } = useAuth();
  return (
    <section className="py-28 px-6 bg-[#173C2E] text-[#F6F3EC] text-center">
      <h2 className="font-serif text-4xl md:text-5xl mb-6 leading-tight">
        Trace the journey.
        <br />
        Protect the produce.
        <br />
        Trust the data.
      </h2>
      <p className="text-[#F6F3EC]/70 max-w-md mx-auto mb-10">
        AgriTrace connects physical shipments with trustworthy digital records from
        origin to destination.
      </p>
      <div className="flex flex-wrap justify-center gap-4">
        <a href="#how" className="px-6 py-3 rounded-md bg-[#F6F3EC] text-[#173C2E] font-medium">
          Explore the Platform
        </a>
        <Link
          to={authLink(isAuthenticated, "/shipments/active")}
          className="px-6 py-3 rounded-md border border-[#F6F3EC]/40 font-medium"
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
      className="py-14 px-6 border-t border-[#173C2E]/10"
      style={{ paddingBottom: "calc(3.5rem + env(safe-area-inset-bottom, 0px))" }}
    >
      <div className="max-w-7xl mx-auto flex flex-wrap justify-between gap-8">
        <div className="max-w-xs">
          <p className="font-serif text-lg text-[#173C2E] mb-2">AgriTrace</p>
          <p className="text-sm text-[#1B1B18]/60">
            Smart farm-to-fork traceability and environmental monitoring.
          </p>
        </div>
        <div className="flex gap-12 text-sm text-[#1B1B18]/60">
          <div className="space-y-2">
            <p className="text-[#1B1B18] font-medium">Platform</p>
            <p>Technology</p>
            <p>Traceability</p>
          </div>
          <div className="space-y-2">
            <p className="text-[#1B1B18] font-medium">Company</p>
            <p>About</p>
            <p>Contact</p>
            <p>Privacy</p>
          </div>
        </div>
      </div>
      <p className="max-w-7xl mx-auto mt-10 text-xs text-[#1B1B18]/40">
        AgriTrace — Smart Farm-to-Fork Traceability
      </p>
    </footer>
  );
}

/* ---------- Page ---------- */

export default function Landing() {
  return (
    <div className="font-sans bg-[#F6F3EC] text-[#1B1B18]">
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