import { useEffect, useMemo, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  Popup,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import {
  FaRoute,
  FaLocationDot,
  FaWandMagicSparkles,
  FaRotate,
  FaCheck,
  FaTriangleExclamation,
} from "react-icons/fa6";

import {
  optimizeRoute,
  getShipmentRoute,
  selectRoute,
} from "../../api/routeApi";

import "./ShipmentRoutePlanner.css";


// ----------------------------------------------------
// Fix Leaflet default marker icons in Vite
// ----------------------------------------------------

delete L.Icon.Default.prototype._getIconUrl;

L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});


function FitRoute({ points }) {
  const map = useMap();

  useEffect(() => {
    if (!points?.length) return;

    if (points.length === 1) {
      map.setView(points[0], 12);
      return;
    }

    const bounds = L.latLngBounds(points);
    map.fitBounds(bounds, {
      padding: [35, 35],
    });
  }, [map, points]);

  return null;
}


function getApiData(response) {
  if (!response) return null;

  // Supports both:
  // { data: {...} }
  // and direct {...}
  return response.data ?? response;
}


function getErrorMessage(error, fallback) {
  return (
    error?.response?.data?.message ||
    error?.response?.data?.error ||
    error?.message ||
    fallback
  );
}


function toNumber(value) {
  if (
    value === "" ||
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}


function validCoordinate(latitude, longitude) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}


const MODE_LABELS = {
  SHORTEST: "Shortest",
  BALANCED: "Balanced",
  LOW_DENSITY: "Low Density",
};


export default function ShipmentRoutePlanner({
  shipment,
  currentUser,
  latestTelemetry,
}) {
  const shipmentId =
    shipment?.shipmentId ||
    shipment?._id ||
    null;

  const [startLat, setStartLat] = useState("");
  const [startLng, setStartLng] = useState("");

  const [destinationLat, setDestinationLat] =
    useState("");
  const [destinationLng, setDestinationLng] =
    useState("");

  const [routeData, setRouteData] = useState(null);
  const [routePlanId, setRoutePlanId] = useState(null);

  const [selectedMode, setSelectedMode] =
    useState(null);

  const [loadingExisting, setLoadingExisting] =
    useState(false);

  const [generating, setGenerating] =
    useState(false);

  const [selecting, setSelecting] =
    useState(false);

  const [error, setError] = useState("");


  const role = String(
    currentUser?.role || ""
  ).toUpperCase();

  const canManageRoute =
    role === "TRANSPORTER" ||
    role === "ADMIN";


  // --------------------------------------------------
  // Latest valid device GPS position (informational)
  // Never replaces the planned destination.
  // --------------------------------------------------

  const telemetryPosition = useMemo(() => {
    const latitude = toNumber(
      latestTelemetry?.latitude
    );

    const longitude = toNumber(
      latestTelemetry?.longitude
    );

    if (
      latestTelemetry?.gpsValid !== true ||
      !validCoordinate(latitude, longitude)
    ) {
      return null;
    }

    return {
      latitude,
      longitude,
      displayName:
        latestTelemetry?.location?.displayName ||
        null,
    };
  }, [latestTelemetry]);


  // --------------------------------------------------
  // Load coordinates already stored in shipment
  // --------------------------------------------------

  useEffect(() => {
    if (!shipment) return;

    const start =
      shipment?.startPoint ||
      shipment?.sourceCoordinates ||
      shipment?.originCoordinates ||
      null;

    const destination =
      shipment?.destinationPoint ||
      shipment?.destinationCoordinates ||
      null;

    if (
      start?.latitude !== undefined &&
      start?.longitude !== undefined
    ) {
      setStartLat(String(start.latitude));
      setStartLng(String(start.longitude));
    }

    if (
      destination?.latitude !== undefined &&
      destination?.longitude !== undefined
    ) {
      setDestinationLat(
        String(destination.latitude)
      );

      setDestinationLng(
        String(destination.longitude)
      );
    }
  }, [shipment]);


  // --------------------------------------------------
  // Load saved route plan
  // --------------------------------------------------

  useEffect(() => {
    if (!shipmentId || !canManageRoute) return;

    let cancelled = false;

    const loadRoute = async () => {
      setLoadingExisting(true);

      try {
        const response =
          await getShipmentRoute(shipmentId);

        if (cancelled) return;

        const saved = getApiData(response);

        if (!saved) return;

        setRoutePlanId(
          saved.routePlanId || null
        );

        setSelectedMode(
          saved.selectedMode || null
        );

        setRouteData({
          recommendedRoute:
            saved.recommendedRoute || null,

          alternatives:
            saved.alternatives || null,

          recommendedMode:
            saved.selectedMode || null,

          explanation:
            saved.explanation || "",
        });

        if (saved.startPoint) {
          setStartLat(
            String(saved.startPoint.latitude ?? "")
          );

          setStartLng(
            String(saved.startPoint.longitude ?? "")
          );
        }

        const finalStop =
          Array.isArray(saved.stops) &&
          saved.stops.length
            ? saved.stops[saved.stops.length - 1]
            : null;

        if (finalStop) {
          setDestinationLat(
            String(finalStop.latitude ?? "")
          );

          setDestinationLng(
            String(finalStop.longitude ?? "")
          );
        }

      } catch (err) {
        // A 404 simply means the shipment
        // has no generated route yet.
        if (err?.response?.status !== 404) {
          console.error(
            "Failed to load shipment route:",
            err
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingExisting(false);
        }
      }
    };

    loadRoute();

    return () => {
      cancelled = true;
    };

  }, [shipmentId, canManageRoute]);


  // --------------------------------------------------
  // Generate route
  // --------------------------------------------------

  const handleGenerateRoute = async () => {
    setError("");

    const latitude1 = toNumber(startLat);
    const longitude1 = toNumber(startLng);

    const latitude2 =
      toNumber(destinationLat);

    const longitude2 =
      toNumber(destinationLng);


    if (
      !validCoordinate(
        latitude1,
        longitude1
      )
    ) {
      setError(
        "Enter a valid source latitude and longitude."
      );
      return;
    }


    if (
      !validCoordinate(
        latitude2,
        longitude2
      )
    ) {
      setError(
        "Enter a valid destination latitude and longitude."
      );
      return;
    }


    if (!shipmentId) {
      setError(
        "Shipment ID is unavailable."
      );
      return;
    }


    const payload = {
      shipmentId,

      startPoint: {
        latitude: latitude1,
        longitude: longitude1,
      },

      stops: [
        {
          latitude: latitude2,
          longitude: longitude2,
        },
      ],

      optimizationMode: "BALANCED",
    };


    try {
      setGenerating(true);

      const response =
        await optimizeRoute(payload);

      const result =
        getApiData(response);

      if (!result) {
        throw new Error(
          "Route API returned no data."
        );
      }

      setRouteData(result);

      setRoutePlanId(
        result.routePlanId || null
      );

      setSelectedMode(
        result.recommendedMode || null
      );

    } catch (err) {
      console.error(
        "Route generation failed:",
        err
      );

      setError(
        getErrorMessage(
          err,
          "Failed to generate route."
        )
      );

    } finally {
      setGenerating(false);
    }
  };


  // --------------------------------------------------
  // Select route alternative
  // --------------------------------------------------

  const handleSelectMode = async (mode) => {
    if (
      !shipmentId ||
      !routePlanId ||
      !mode
    ) {
      return;
    }

    setError("");
    setSelecting(true);

    try {
      await selectRoute(
        shipmentId,
        {
          routePlanId,
          selectedOption: mode,
        }
      );

      setSelectedMode(mode);

    } catch (err) {
      console.error(
        "Route selection failed:",
        err
      );

      setError(
        getErrorMessage(
          err,
          "Failed to select route."
        )
      );

    } finally {
      setSelecting(false);
    }
  };


  // --------------------------------------------------
  // Currently displayed route
  // --------------------------------------------------

  const activeRoute = useMemo(() => {
    if (!routeData) return null;

    if (
      selectedMode &&
      routeData.alternatives
    ) {
      const key =
        selectedMode.toLowerCase();

      if (routeData.alternatives[key]) {
        return routeData.alternatives[key];
      }
    }

    return (
      routeData.recommendedRoute ||
      null
    );
  }, [routeData, selectedMode]);


  // --------------------------------------------------
  // Map points
  // --------------------------------------------------

  const mapPoints = useMemo(() => {
    const points = [];

    const latitude =
      toNumber(startLat);

    const longitude =
      toNumber(startLng);

    if (
      validCoordinate(
        latitude,
        longitude
      )
    ) {
      points.push([
        latitude,
        longitude,
      ]);
    }


    if (
      Array.isArray(
        activeRoute?.optimizedRoute
      )
    ) {
      activeRoute.optimizedRoute.forEach(
        (point) => {
          if (
            validCoordinate(
              point?.latitude,
              point?.longitude
            )
          ) {
            points.push([
              point.latitude,
              point.longitude,
            ]);
          }
        }
      );
    }

    return points;
  }, [
    activeRoute,
    startLat,
    startLng,
  ]);


  // Points used to frame the map: the planned route plus the
  // current device position (when a valid GPS fix exists).

  const fitPoints = useMemo(() => {
    if (!telemetryPosition) {
      return mapPoints;
    }

    return [
      ...mapPoints,
      [
        telemetryPosition.latitude,
        telemetryPosition.longitude,
      ],
    ];
  }, [mapPoints, telemetryPosition]);


  const hasMapRoute =
    mapPoints.length >= 2;


  // Show the live position even when no planned route exists yet.

  const showMap =
    hasMapRoute || Boolean(telemetryPosition);


  // --------------------------------------------------
  // UI
  // --------------------------------------------------

  return (
    <section className="route-planner-card">

      <div className="route-planner-header">

        <div>
          <div className="route-title-row">
            <div className="route-icon">
              <FaRoute />
            </div>

            <div>
              <h2>AI Route Planner</h2>

              <p>
                Optimize shipment movement using
                distance and route-density analysis.
              </p>
            </div>
          </div>
        </div>

        <span className="route-ai-badge">
          <FaWandMagicSparkles />
          Smart Routing
        </span>

      </div>


      {!canManageRoute && (
        <div className="route-info-message">
          Route planning is available to the
          assigned transporter or administrator.
        </div>
      )}


      {canManageRoute && (
        <>
          <div className="route-location-grid">

            <div className="route-location-box">

              <div className="route-location-heading">
                <FaLocationDot />
                Source
              </div>

              <div className="route-coordinate-grid">

                <label>
                  <span>Latitude</span>

                  <input
                    type="number"
                    step="any"
                    value={startLat}
                    placeholder="Not available"
                    onChange={(e) =>
                      setStartLat(
                        e.target.value
                      )
                    }
                  />
                </label>


                <label>
                  <span>Longitude</span>

                  <input
                    type="number"
                    step="any"
                    value={startLng}
                    placeholder="Not available"
                    onChange={(e) =>
                      setStartLng(
                        e.target.value
                      )
                    }
                  />
                </label>

              </div>

              {shipment?.source && (
                <div className="route-place-name">
                  {shipment.source}
                </div>
              )}

            </div>


            <div className="route-arrow">
              →
            </div>


            <div className="route-location-box">

              <div className="route-location-heading">
                <FaLocationDot />
                Destination
              </div>

              <div className="route-coordinate-grid">

                <label>
                  <span>Latitude</span>

                  <input
                    type="number"
                    step="any"
                    value={destinationLat}
                    placeholder="Not available"
                    onChange={(e) =>
                      setDestinationLat(
                        e.target.value
                      )
                    }
                  />
                </label>


                <label>
                  <span>Longitude</span>

                  <input
                    type="number"
                    step="any"
                    value={destinationLng}
                    placeholder="Not available"
                    onChange={(e) =>
                      setDestinationLng(
                        e.target.value
                      )
                    }
                  />
                </label>

              </div>

              {shipment?.destination && (
                <div className="route-place-name">
                  {shipment.destination}
                </div>
              )}

            </div>

          </div>


          {error && (
            <div className="route-error">
              <FaTriangleExclamation />
              {error}
            </div>
          )}


          <div className="route-generate-row">

            <button
              type="button"
              className="route-primary-button"
              onClick={handleGenerateRoute}
              disabled={
                generating ||
                loadingExisting
              }
            >
              {generating ? (
                <>
                  <span className="route-spinner" />
                  Optimizing Route...
                </>
              ) : routeData ? (
                <>
                  <FaRotate />
                  Recalculate Route
                </>
              ) : (
                <>
                  <FaWandMagicSparkles />
                  Generate AI Route
                </>
              )}
            </button>

          </div>
        </>
      )}


      {loadingExisting && (
        <div className="route-empty-state">
          <span className="route-spinner dark" />
          Loading route plan...
        </div>
      )}


      {!loadingExisting &&
        canManageRoute &&
        !routeData && (
          <div className="route-empty-state">

            <FaRoute />

            <h3>
              No route generated
            </h3>

            <p>
              Enter valid source and destination
              coordinates to generate route
              alternatives for this shipment.
            </p>

          </div>
        )}


      {!loadingExisting &&
        routeData &&
        activeRoute && (
          <>

            <div className="route-result-heading">

              <div>
                <span className="route-result-label">
                  Selected Route
                </span>

                <h3>
                  {MODE_LABELS[
                    selectedMode
                  ] ||
                    selectedMode ||
                    "Recommended"}
                </h3>
              </div>


              {selectedMode ===
                routeData.recommendedMode && (
                <span className="route-recommended">
                  <FaCheck />
                  Recommended
                </span>
              )}

            </div>


            <div className="route-stat-grid">

              <div className="route-stat">
                <span>
                  Total Distance
                </span>

                <strong>
                  {activeRoute
                    ?.totalDistanceKm ??
                    "—"}
                  {activeRoute
                    ?.totalDistanceKm !=
                    null
                    ? " km"
                    : ""}
                </strong>
              </div>


              <div className="route-stat">
                <span>
                  Dense Stops
                </span>

                <strong>
                  {activeRoute
                    ?.denseStopCount ??
                    "—"}
                </strong>
              </div>


              <div className="route-stat">
                <span>
                  Density Score
                </span>

                <strong>
                  {activeRoute
                    ?.densityScore ??
                    "—"}
                </strong>
              </div>


              <div className="route-stat">
                <span>
                  Route Score
                </span>

                <strong>
                  {activeRoute
                    ?.routeScore ??
                    "—"}
                </strong>
              </div>

            </div>


            {routeData?.explanation && (
              <div className="route-explanation">
                <FaWandMagicSparkles />

                <div>
                  <strong>
                    Recommendation
                  </strong>

                  <p>
                    {
                      routeData.explanation
                    }
                  </p>
                </div>
              </div>
            )}


            {showMap && (
              <div className="route-map-wrapper">

                <MapContainer
                  center={
                    mapPoints[0] ||
                    (telemetryPosition && [
                      telemetryPosition.latitude,
                      telemetryPosition.longitude,
                    ])
                  }
                  zoom={8}
                  scrollWheelZoom
                  className="route-map"
                >

                  <TileLayer
                    attribution='&copy; OpenStreetMap contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />


                  {mapPoints.map(
                    (point, index) => (
                      <Marker
                        key={`${point[0]}-${point[1]}-${index}`}
                        position={point}
                      >
                        <Popup>
                          {index === 0
                            ? "Source"
                            : index ===
                              mapPoints.length -
                                1
                            ? "Destination"
                            : `Stop ${index}`}
                        </Popup>
                      </Marker>
                    )
                  )}


                  {telemetryPosition && (
                    <Marker
                      position={[
                        telemetryPosition.latitude,
                        telemetryPosition.longitude,
                      ]}
                    >
                      <Popup>
                        {telemetryPosition.displayName
                          ? `Current GPS position: ${telemetryPosition.displayName}`
                          : "Current GPS position"}
                      </Popup>
                    </Marker>
                  )}


                  {hasMapRoute && (
                    <Polyline
                      positions={mapPoints}
                    />
                  )}


                  <FitRoute points={fitPoints} />

                </MapContainer>

              </div>
            )}


            {telemetryPosition && (
              <div className="route-place-name">
                <FaLocationDot />{" "}
                Current GPS position:{" "}
                {telemetryPosition.displayName ||
                  `${telemetryPosition.latitude.toFixed(
                    5
                  )}, ${telemetryPosition.longitude.toFixed(
                    5
                  )}`}
              </div>
            )}


            {routeData?.alternatives && (
              <div className="route-alternatives">

                <div className="route-section-heading">
                  <h3>
                    Route Alternatives
                  </h3>

                  <p>
                    Compare available optimization
                    strategies.
                  </p>
                </div>


                <div className="route-option-grid">

                  {[
                    "SHORTEST",
                    "BALANCED",
                    "LOW_DENSITY",
                  ].map((mode) => {

                    const route =
                      routeData.alternatives[
                        mode.toLowerCase()
                      ];

                    if (!route) return null;

                    const active =
                      selectedMode === mode;

                    return (
                      <button
                        type="button"
                        key={mode}
                        className={`route-option ${
                          active
                            ? "active"
                            : ""
                        }`}
                        onClick={() =>
                          handleSelectMode(
                            mode
                          )
                        }
                        disabled={
                          selecting ||
                          !routePlanId
                        }
                      >

                        <div className="route-option-top">

                          <strong>
                            {
                              MODE_LABELS[
                                mode
                              ]
                            }
                          </strong>

                          {active && (
                            <span>
                              <FaCheck />
                              Selected
                            </span>
                          )}

                        </div>


                        <div className="route-option-distance">
                          {route.totalDistanceKm ??
                            "—"}

                          {route.totalDistanceKm !=
                          null
                            ? " km"
                            : ""}
                        </div>


                        <small>
                          Dense stops:{" "}
                          {route.denseStopCount ??
                            "—"}
                        </small>

                      </button>
                    );
                  })}

                </div>

              </div>
            )}

          </>
        )}

    </section>
  );
}