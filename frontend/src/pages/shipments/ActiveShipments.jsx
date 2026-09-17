import React, { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  FaMagnifyingGlass,
  FaLocationDot,
  FaArrowRight,
  FaGrip,
  FaList,
} from "react-icons/fa6";

import { listShipments } from "../../api/shipmentApi";
import LoadingSpinner from "../../components/common/LoadingSpinner";
import EmptyState from "../../components/common/EmptyState";
import { useAuth } from "../../context/AuthContext";

function getStatusClass(status) {
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

function ActiveShipments() {
  const { role } = useAuth();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [product, setProduct] = useState("");
  const [sort, setSort] = useState("recent");
  const [view, setView] = useState("grid");
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setEmpty] = useState(null);

  // Fetch shipments whenever filters change
  useEffect(() => {
    setLoading(true);
    setEmpty(null);
    const params = {};
    if (status) params.status = status;
    if (product) params.product = product;
    if (search) params.search = search;
    if (sort) params.sort = sort;
    listShipments(params)
      .then((data) => {
        setShipments(data ?? []);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setEmpty(err);
        setLoading(false);
      });
  }, [status, product, search, sort]);

  const products = useMemo(() => {
    const set = new Set();
    shipments.forEach((s) => set.add(s.product));
    return Array.from(set);
  }, [shipments]);

  const stageLabels = ["Farm", "Transit", "Warehouse", "Retailer"];

  if (loading) {
    return <LoadingSpinner />;
  }

  if (error) {
    return (
      <EmptyState
        message="Failed to load shipments"
        retry={() => setLoading(true)}
      />
    );
  }

  return (
    <div className="active-shipments-page">
      {/* ========================= FILTER TOOLBAR ========================= */}
      <section className="shipment-toolbar card">
        <div className="shipment-search">
          <FaMagnifyingGlass />
          <input
            type="text"
            placeholder="Search by ID, product, destination..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All Status</option>
          <option value="In Transit">In Transit</option>
          <option value="Delayed">Delayed</option>
          <option value="Warehouse">Warehouse</option>
          <option value="Alert">Alert</option>
        </select>
        <select value={product} onChange={(e) => setProduct(e.target.value)}>
          <option value="">All Products</option>
          {products.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="recent">Sort: Most Recent</option>
          <option value="id">Sort: Shipment ID</option>
        </select>
        <div className="shipment-view-toggle">
          <button
            type="button"
            className={view === "grid" ? "active" : ""}
            onClick={() => setView("grid")}
            title="Grid view"
          >
            <FaGrip />
          </button>
          <button
            type="button"
            className={view === "list" ? "active" : ""}
            onClick={() => setView("list")}
            title="List view"
          >
            <FaList />
          </button>
        </div>
      </section>

      {/* ========================= GRID VIEW ========================= */}
      {view === "grid" && (
        <section className="shipment-card-grid">
          {shipments.map((shipment) => (
            <article className="shipment-card" key={shipment.id}>
              <div className="sc-top">
                <div>
                  <div className="sc-id">{shipment.name || shipment.id}</div>
                  <div className="sc-product">{shipment.product}</div>
                </div>
                <span className={`badge ${getStatusClass(shipment.status)}`}> {shipment.status} </span>
              </div>
              <div className="sc-route">
                <FaLocationDot />
                <span>{shipment.source}</span>
                <FaArrowRight />
                <span>{shipment.destination}</span>
              </div>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${shipment.progress}%` }} />
              </div>
              <div className="sc-journey">
                {stageLabels.map((label, index) => (
                  <span key={label} className={index <= shipment.stage ? "on" : ""}>
                    {label}
                  </span>
                ))}
              </div>
              <div className="sc-footer">
                <span className="sc-updated">
                  Updated {shipment.updated} · {shipment.device || "No device"}
                </span>
                <Link className="btn ghost small" to={`/shipments/${shipment.id}`}>View Details</Link>
              </div>
            </article>
          ))}
        </section>
      )}

      {/* ========================= LIST VIEW ========================= */}
      {view === "list" && (
        <section className="card shipment-list-card">
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Shipment Name</th>
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
                {shipments.map((shipment) => (
                  <tr key={shipment.id}>
                    <td><span className="mono-id">{shipment.name || shipment.id}</span></td>
                    <td>{shipment.product}</td>
                    <td>{shipment.source}</td>
                    <td>{shipment.destination}</td>
                    <td>{shipment.device || "—"}</td>
                    <td><span className={`badge ${getStatusClass(shipment.status)}`}>{shipment.status}</span></td>
                    <td>{shipment.updated}</td>
                    <td>
                      <Link className="btn ghost small" to={`/shipments/${shipment.id}`}>View</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {shipments.length === 0 && (
        <div className="card shipment-empty-state">
          No shipments match your filters.
        </div>
      )}
    </div>
  );
}

export default ActiveShipments;