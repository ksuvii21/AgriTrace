import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getPublicTrace } from "../api/traceabilityApi";

const PublicTrace = () => {
  const { trackingId } = useParams();
  const navigate = useNavigate();

  const [searchId, setSearchId] = useState(trackingId || "");
  const [trace, setTrace] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchTrace = async (id) => {
    if (!id.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getPublicTrace(id.trim());
      setTrace(data);
    } catch (err) {
      if (err.status === 404) {
        setError("Tracking ID not found. Please verify the ID and try again.");
      } else if (err.status === null) {
        setError("Network error - please check your connection.");
      } else {
        setError(err.message || "Failed to fetch trace data.");
      }
      setTrace(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (trackingId) {
      fetchTrace(trackingId);
    }
  }, [trackingId]);

  const handleSearch = (event) => {
    event.preventDefault();
    if (!searchId.trim()) return;
    navigate(`/trace/${searchId.trim()}`);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "—";
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusClass = (status) => {
    if (!status) return "";
    const s = status.toLowerCase();
    if (s.includes("deliver")) return "positive-text";
    if (s.includes("transit") || s.includes("ship")) return "";
    if (s.includes("delay")) return "alert-text";
    return "positive-text";
  };

  return (
    <div className="public-trace-page">
      <style>{`
        .public-trace-page {
          max-width: 800px;
          margin: 0 auto;
          padding: 30px 20px;
          font-family: inherit;
          color: #0f172a;
        }
        .public-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 30px;
        }
        .public-logo {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .logo-icon {
          width: 40px;
          height: 40px;
          background: #10b981;
          color: #fff;
          font-weight: 700;
          font-size: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 10px;
        }
        .public-logo strong {
          display: block;
          font-size: 16px;
          color: #0f172a;
        }
        .public-logo small {
          font-size: 12px;
          color: #64748b;
        }
        .verified-badge {
          background: #ecfdf5;
          color: #065f46;
          border: 1px solid #a7f3d0;
          padding: 6px 12px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 600;
        }
        .trace-hero {
          text-align: center;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          padding: 40px 20px;
          margin-bottom: 24px;
        }
        .hero-label {
          font-size: 11px;
          font-weight: 700;
          color: #10b981;
          letter-spacing: 1px;
          text-transform: uppercase;
        }
        .trace-hero h1 {
          font-size: 28px;
          margin: 10px 0;
          color: #0f172a;
        }
        .trace-hero h1 span {
          color: #10b981;
        }
        .trace-hero p {
          font-size: 14px;
          color: #64748b;
          margin-bottom: 24px;
        }
        .trace-search {
          display: flex;
          max-width: 480px;
          margin: 0 auto;
          gap: 10px;
        }
        .trace-search input {
          flex: 1;
          padding: 10px 14px;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          font-size: 14px;
          outline: none;
        }
        .trace-search input:focus {
          border-color: #10b981;
        }
        .trace-search button {
          background: #10b981;
          color: #fff;
          border: none;
          padding: 10px 20px;
          border-radius: 8px;
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
        }
        .trace-search button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .public-trace-content {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .trace-product-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 24px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .trace-status {
          font-size: 11px;
          font-weight: 700;
          color: #10b981;
        }
        .trace-product-card h2 {
          font-size: 20px;
          margin: 6px 0;
          color: #0f172a;
        }
        .trace-product-card p {
          font-size: 13px;
          color: #64748b;
          margin: 0;
        }
        .trust-score {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 12px 20px;
          text-align: center;
        }
        .trust-score span {
          display: block;
          font-size: 11px;
          color: #64748b;
          text-transform: uppercase;
        }
        .trust-score strong {
          font-size: 22px;
          color: #10b981;
        }
        .trust-score small {
          font-size: 12px;
          color: #64748b;
        }
        .consumer-info-grid, .consumer-condition-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 20px;
        }
        .consumer-condition-grid {
          grid-template-columns: repeat(3, 1fr);
        }
        .consumer-info-grid div, .consumer-condition-grid div {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .consumer-info-grid span, .consumer-condition-grid span {
          font-size: 11.5px;
          color: #64748b;
        }
        .consumer-info-grid strong, .consumer-condition-grid strong {
          font-size: 14px;
          color: #0f172a;
        }
        .positive-text {
          color: #10b981 !important;
        }
        .alert-text {
          color: #f59e0b !important;
        }
        .trace-section {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 24px;
        }
        .section-heading h2 {
          font-size: 16px;
          margin: 0 0 4px 0;
          color: #0f172a;
        }
        .section-heading p {
          font-size: 12.5px;
          color: #64748b;
          margin: 0 0 20px 0;
        }
        .timeline {
          display: flex;
          flex-direction: column;
          gap: 20px;
          position: relative;
          padding-left: 10px;
        }
        .timeline-item {
          display: flex;
          gap: 16px;
          position: relative;
        }
        .timeline-marker {
          width: 28px;
          height: 28px;
          background: #ecfdf5;
          color: #10b981;
          border: 1px solid #a7f3d0;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: 700;
          z-index: 2;
        }
        .timeline-content h3 {
          font-size: 14px;
          margin: 0;
          color: #0f172a;
        }
        .timeline-content strong {
          font-size: 12.5px;
          color: #334155;
          display: block;
          margin: 2px 0;
        }
        .timeline-content span {
          font-size: 11.5px;
          color: #64748b;
          display: block;
          margin-bottom: 4px;
        }
        .timeline-content p {
          font-size: 13px;
          color: #475569;
          margin: 0;
        }
        .blockchain-proof {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 24px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .blockchain-proof span {
          font-size: 11px;
          font-weight: 700;
          color: #10b981;
          text-transform: uppercase;
        }
        .blockchain-proof h3 {
          font-size: 15px;
          margin: 4px 0;
          color: #0f172a;
        }
        .blockchain-proof p {
          font-size: 13px;
          color: #64748b;
          margin: 0;
        }
        .blockchain-proof code {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          padding: 10px 14px;
          border-radius: 8px;
          font-size: 12px;
          color: #334155;
          max-width: 260px;
          word-break: break-all;
        }
        .error-state {
          text-align: center;
          padding: 60px 20px;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
        }
        .error-state h2 {
          color: #ef4444;
          margin-bottom: 12px;
        }
        .error-state p {
          color: #64748b;
          margin-bottom: 24px;
        }
        .error-state button {
          background: #10b981;
          color: #fff;
          border: none;
          padding: 10px 24px;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
        }
        .loading-state {
          text-align: center;
          padding: 60px 20px;
        }
        .spinner {
          width: 40px;
          height: 40px;
          border: 3px solid #e2e8f0;
          border-top-color: #10b981;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin: 0 auto 16px;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .empty-state {
          text-align: center;
          padding: 40px 20px;
        }
        .data-unavailable {
          background: #fef3c7;
          border: 1px solid #fde68a;
          border-radius: 8px;
          padding: 12px 16px;
          color: #92400e;
          font-size: 13px;
          margin-bottom: 16px;
        }
        .public-footer {
          text-align: center;
          font-size: 12px;
          color: #64748b;
          margin-top: 40px;
          padding-top: 20px;
          border-top: 1px solid #e2e8f0;
        }
        @media (max-width: 768px) {
          .consumer-info-grid {
            grid-template-columns: repeat(2, 1fr);
          }
          .consumer-condition-grid {
            grid-template-columns: 1fr;
          }
          .blockchain-proof {
            flex-direction: column;
            align-items: flex-start;
            gap: 16px;
          }
        }
      `}</style>

      <header className="public-header">
        <div className="public-logo">
          <span className="logo-icon">A</span>
          <div>
            <strong>AgriTrace</strong>
            <small>Farm-to-Fork Transparency</small>
          </div>
        </div>

        <span className="verified-badge">
          Verified Traceability
        </span>
      </header>

      <section className="trace-hero">
        <span className="hero-label">
          KNOW YOUR FOOD
        </span>

        <h1>
          Trace your food from
          <span> farm to fork.</span>
        </h1>

        <p>
          Enter the trace ID printed on your package or scan
          its QR code.
        </p>

        <form
          className="trace-search"
          onSubmit={handleSearch}
        >
          <input
            type="text"
            value={searchId}
            onChange={(e) =>
              setSearchId(e.target.value)
            }
            placeholder="Example: AGR-2026-0001"
            disabled={loading}
          />

          <button type="submit" disabled={loading}>
            {loading ? "Searching..." : "Trace Product"}
          </button>
        </form>
      </section>

      {loading && (
        <div className="loading-state">
          <div className="spinner" />
          <p>Fetching trace data...</p>
        </div>
      )}

      {error && (
        <div className="error-state">
          <h2>Trace Not Found</h2>
          <p>{error}</p>
          <button onClick={() => navigate("/trace")}>
            Search Again
          </button>
        </div>
      )}

      {trace && (
        <main className="public-trace-content">
          <section className="trace-product-card">
            <div>
              <span className="trace-status">
                ✓ VERIFIED PRODUCT
              </span>

              <h2>{trace.productName || "Unknown Product"}</h2>

              <p>
                Trace ID:{" "}
                <strong>{trace.trackingId || "N/A"}</strong>
              </p>
            </div>

            <div className="trust-score">
              <span>Trust Score</span>
              <strong>
                {trace.integrity?.verified ? "98" : "—"}
              </strong>
              <small>/ 100</small>
            </div>
          </section>

          <section className="consumer-info-grid">
            <div>
              <span>Batch</span>
              <strong>{trace.trackingId || "N/A"}</strong>
            </div>

            <div>
              <span>Origin</span>
              <strong>{trace.origin || "N/A"}</strong>
            </div>

            <div>
              <span>Status</span>
              <strong className={getStatusClass(trace.status)}>
                {trace.status || "Unknown"}
              </strong>
            </div>

            <div>
              <span>Updated</span>
              <strong>{trace.createdAt ? formatDate(trace.createdAt) : "N/A"}</strong>
            </div>
          </section>

          <section className="trace-section">
            <div className="section-heading">
              <h2>Journey</h2>
              <p>
                Verified events across the supply chain
              </p>
            </div>

            {trace.timeline && trace.timeline.length > 0 ? (
              <div className="timeline">
                {trace.timeline.map((item, index) => (
                  <div
                    className="timeline-item"
                    key={index}
                  >
                    <div className="timeline-marker">
                      ✓
                    </div>

                    <div className="timeline-content">
                      <h3>{item.type || "Event"}</h3>
                      <span>{item.timestamp ? formatDate(item.timestamp) : "—"}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="data-unavailable">
                No journey events available for this trace.
              </div>
            )}
          </section>

          <section className="trace-section">
            <div className="section-heading">
              <h2>Product Conditions</h2>
              <p>
                Environmental conditions recorded during
                transportation
              </p>
            </div>

            {!trace.hasMonitoringDevice ? (
              <div className="data-unavailable">
                No monitoring device was attached to this shipment.
              </div>
            ) : trace.latestTelemetry ? (
              <>
                <div className="consumer-condition-grid">
                  <div>
                    <span>Average Temperature</span>
                    <strong>
                      {trace.environment?.averageTemperature !== undefined && trace.environment?.averageTemperature !== null
                        ? `${trace.environment.averageTemperature}°C`
                        : "N/A"}
                    </strong>
                  </div>

                  <div>
                    <span>Average Humidity</span>
                    <strong>
                      {trace.environment?.averageHumidity !== undefined && trace.environment?.averageHumidity !== null
                        ? `${trace.environment.averageHumidity}%`
                        : "N/A"}
                    </strong>
                  </div>

                  <div>
                    <span>Condition</span>
                    <strong className={
                      trace.environment?.condition === "GOOD" ? "positive-text" : "alert-text"
                    }>
                      {trace.environment?.condition || "Unknown"}
                    </strong>
                  </div>
                </div>

                {trace.latestTelemetry && (
                  <div style={{ marginTop: 16 }} className="consumer-condition-grid">
                    <div>
                      <span>Latest Temperature</span>
                      <strong>
                        {trace.latestTelemetry.temperature !== undefined && trace.latestTelemetry.temperature !== null
                          ? `${trace.latestTelemetry.temperature}°C`
                          : "N/A"}
                      </strong>
                    </div>

                    <div>
                      <span>Latest Humidity</span>
                      <strong>
                        {trace.latestTelemetry.humidity !== undefined && trace.latestTelemetry.humidity !== null
                          ? `${trace.latestTelemetry.humidity}%`
                          : "N/A"}
                      </strong>
                    </div>

                    <div>
                      <span>Last Reading</span>
                      <strong>
                        {trace.latestTelemetry.timestamp ? formatDate(trace.latestTelemetry.timestamp) : "N/A"}
                      </strong>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="data-unavailable">
                {trace.deviceMessage || "Monitoring device assigned. No telemetry readings are available yet."}
              </div>
            )}
          </section>

          <section className="blockchain-proof">
            <div>
              <span>Integrity Verified</span>

              <h3>
                Tamper-resistant supply chain record
              </h3>

              <p>
                {trace.integrity?.verified
                  ? "This traceability record has been cryptographically verified."
                  : trace.integrity?.message || (
                      trace.integrity?.checkpointCount
                        ? "Integrity check encountered an issue."
                        : "Integrity checkpoint not available yet"
                    )}
              </p>
            </div>

            <code>
              {trace.integrity?.status || "PENDING"}
            </code>
          </section>
        </main>
      )}

      {!loading && !error && !trace && !trackingId && (
        <div className="empty-state">
          <p style={{ color: "#64748b" }}>Enter a tracking ID above to view trace details.</p>
        </div>
      )}

      <footer className="public-footer">
        AgriTrace • Transparent food supply chains
      </footer>
    </div>
  );
};

export default PublicTrace;