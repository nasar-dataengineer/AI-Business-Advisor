import { useEffect, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  GeoJSON,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point } from "@turf/helpers";
import KpkHero from "./KpkHero.jsx";
import "leaflet/dist/leaflet.css";
import "./App.css";

delete L.Icon.Default.prototype._getIconUrl;

L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

const kpkCenter = [34.2, 71.7];

const API_URL = (import.meta.env.VITE_API_URL || "/api").replace(/\/+$/, "");
const DISTRICT_ALIASES = {
  "BAJAUR AGENCY": "BAJAUR",
  "FR BANNU": "BANNU",
  "FR DERA ISMAIL KHAN": "DERA ISMAIL KHAN",
  "FR KOHAT": "KOHAT",
  "FR LAKKI MARWAT": "LAKKI MARWAT",
  "FR PESHAWAR": "PESHAWAR",
  "FR TANK": "TANK",
  "KHYBER AGENCY": "KHYBER",
  "KURRAM AGENCY": "KURRAM",
  "MOHMAND AGENCY": "MOHMAND",
  "NORTH WAZIRISTAN AGENCY": "NORTH WAZIRISTAN",
  "ORAKZAI AGENCY": "ORAKZAI",
  "SOUTH WAZIRISTAN AGENCY": "SOUTH WAZIRISTAN",
  "MALAKAND PA": "MALAKAND",
  "TOR GHAR": "TORGHAR",
  CHITRAL: "LOWER CHITRAL",
  KOHISTAN: "UPPER KOHISTAN",
};

function MapClickHandler({ onLocationSelect }) {
  useMapEvents({
    click(event) {
      onLocationSelect(event.latlng.lat, event.latlng.lng);
    },
  });

  return null;
}

function App() {
  const [location, setLocation] = useState(null);
  const [detectedArea, setDetectedArea] = useState("");
  const [districtInfo, setDistrictInfo] = useState(null);
  const [districtsData, setDistrictsData] = useState([]);
  const [budget, setBudget] = useState(1500000);
  const [districts, setDistricts] = useState(null);
  const [loadingMap, setLoadingMap] = useState(true);
  const [loadingDistricts, setLoadingDistricts] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [backendStatus, setBackendStatus] = useState("checking");
  const activeRequestRef = useRef(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    fetch("/kpk_districts.geojson")
      .then((response) => {
        if (!response.ok) {
          throw new Error("KPK boundary file could not be loaded.");
        }
        return response.json();
      })
      .then((data) => {
        setDistricts(data);
        setLoadingMap(false);
      })
      .catch((err) => {
        console.error(err);
        setError("KPK district boundary file load nahi ho saki.");
        setLoadingMap(false);
      });
  }, []);

  useEffect(() => {
    let isMounted = true;
    let retryTimeout;

    const loadDistricts = async () => {
      try {
        const response = await fetch(`${API_URL}/districts`);

        if (!response.ok) {
          throw new Error("District data could not be loaded.");
        }

        const data = await response.json();
        if (!Array.isArray(data.districts)) {
          throw new Error("Backend returned invalid district data.");
        }

        if (!isMounted) {
          return;
        }

        setDistrictsData(data.districts || []);
        setLoadingDistricts(false);
        setError((currentError) =>
          currentError === "Backend se 35 districts ka data load nahi ho saka."
            ? ""
            : currentError
        );
      } catch (err) {
        console.error(err);
        if (!isMounted) {
          return;
        }

        setError("Backend se 35 districts ka data load nahi ho saka.");
        setLoadingDistricts(false);
        retryTimeout = window.setTimeout(() => {
          if (isMounted) {
            setLoadingDistricts(true);
            loadDistricts();
          }
        }, 5000);
      }
    };

    loadDistricts();

    return () => {
      isMounted = false;
      window.clearTimeout(retryTimeout);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const checkBackend = async () => {
      try {
        const response = await fetch(`${API_URL}/`, {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`Backend health check failed (${response.status}).`);
        }

        const data = await response.json();

        if (!data.message?.includes("API is running")) {
          throw new Error("Backend returned an unexpected health response.");
        }

        if (isMounted) {
          setBackendStatus("connected");
        }
      } catch (err) {
        console.error("Backend connection check failed:", err);
        if (isMounted) {
          setBackendStatus("disconnected");
        }
      }
    };

    checkBackend();
    const intervalId = window.setInterval(checkBackend, 15000);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(
    () => () => {
      activeRequestRef.current?.abort();
    },
    []
  );

  const findDistrictData = (districtName) => {
    if (!districtName) {
      return null;
    }

    return (
      districtsData.find(
        (item) =>
          item.district?.trim().toLowerCase() ===
          districtName.trim().toLowerCase()
      ) || null
    );
  };

  const getCensusDistrictName = (mapDistrict) => {
    const normalizedName = mapDistrict?.trim().toUpperCase();
    return DISTRICT_ALIASES[normalizedName] || normalizedName;
  };

  const detectDistrict = (latitude, longitude) => {
    if (!districts) {
      return null;
    }

    const clickedPoint = point([longitude, latitude]);

    for (const feature of districts.features) {
      try {
        if (booleanPointInPolygon(clickedPoint, feature)) {
          return feature.properties.Name;
        }
      } catch (err) {
        console.error("Polygon detection error:", err);
      }
    }

    return null;
  };

  const handleLocationSelect = (latitude, longitude) => {
    activeRequestRef.current?.abort();
    requestIdRef.current += 1;
    setLoading(false);

    const district = detectDistrict(latitude, longitude);
    const selectedLocation = {
      lat: latitude,
      lng: longitude,
    };
    const censusDistrict = getCensusDistrictName(district);

    setLocation(selectedLocation);

    const normalizedDistrict = district?.trim() || "";

    setDetectedArea(
      normalizedDistrict || "KPK district not detected"
    );

    const info = findDistrictData(censusDistrict);

    setDistrictInfo(info);
    setResult(null);
    setError("");

    if (normalizedDistrict) {
      analyzeBusiness({
        location: selectedLocation,
        area: normalizedDistrict,
        district: info?.district || censusDistrict,
      });
    } else {
      setError("Please KPK ke andar kisi location par click karein.");
    }
  };

  const analyzeBusiness = async (selection = null) => {
    const selectedLocation = selection?.location || location;
    const selectedArea = selection?.area || detectedArea;
    const selectedDistrict =
      selection?.district || districtInfo?.district || selectedArea;

    if (!selectedLocation) {
      setError("Please map par kisi location par click karein.");
      return;
    }

    if (
      !selectedArea ||
      selectedArea === "KPK district not detected"
    ) {
      setError(
        "Please KPK ke andar kisi location par click karein."
      );
      return;
    }

    if (!budget || Number(budget) <= 0) {
      setError("Please valid budget enter karein.");
      return;
    }

    activeRequestRef.current?.abort();
    const requestId = ++requestIdRef.current;
    const controller = new AbortController();
    activeRequestRef.current = controller;

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const response = await fetch(`${API_URL}/predict`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          area: selectedArea,
          district: selectedDistrict,
          budget: Number(budget),
          latitude: selectedLocation.lat,
          longitude: selectedLocation.lng,
        }),
        signal: controller.signal,
      });

      const data = await response.json();
      if (requestId !== requestIdRef.current) {
        return;
      }

      if (!response.ok) {
        throw new Error(
          data.detail || data.error || "Analysis failed."
        );
      }

      if (data.error) {
        setError(data.error);
        return;
      }

      if (requestId === requestIdRef.current) {
        setResult(data);
      }
    } catch (err) {
      if (controller.signal.aborted || requestId !== requestIdRef.current) {
        return;
      }

      console.error("Prediction error:", err);

      setError(
        err instanceof TypeError
          ? "Backend se connection nahi ho saka. Check karein ke FastAPI server running hai."
          : err.message || "Analysis failed."
      );
    } finally {
      if (requestId === requestIdRef.current) {
        activeRequestRef.current = null;
        setLoading(false);
      }
    }
  };

  const districtStyle = {
    color: "#2563eb",
    weight: 1,
    fillColor: "#60a5fa",
    fillOpacity: 0.08,
  };

  return (
    <div className="app">
      <KpkHero
        backendStatus={backendStatus}
        onExplore={() =>
          document
            .getElementById("business-advisor")
            ?.scrollIntoView({
              behavior: "smooth",
            })
        }
      />

      <div className="container" id="business-advisor">
        <header className="header">
          <h1>AI Business Advisor</h1>

          <p>
            Select any location in KPK and discover suitable
            business opportunities.
          </p>
        </header>

        <div className="card">
          <h2>Select Business Location</h2>

          <p className="instruction">
            Map par KPK ke andar kisi bhi location par click karein.
            Analysis selected budget ke sath automatically chalega.
          </p>

          <div className="map-wrapper">
            {loadingMap && (
              <div className="map-loading">
                Loading real KPK district boundaries...
              </div>
            )}

            <MapContainer
              center={kpkCenter}
              zoom={8}
              style={{
                height: "500px",
                width: "100%",
              }}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              {districts && (
                <GeoJSON
                  data={districts}
                  style={districtStyle}
                />
              )}

              <MapClickHandler
                onLocationSelect={handleLocationSelect}
              />

              {location && (
                <Marker
                  position={[
                    location.lat,
                    location.lng,
                  ]}
                >
                  <Popup>
                    <strong>{detectedArea}</strong>

                    <br />

                    Latitude: {location.lat.toFixed(6)}

                    <br />

                    Longitude: {location.lng.toFixed(6)}

                    {districtInfo && (
                      <>
                        <br />

                        Population:{" "}
                        {Number(
                          districtInfo.population_2023
                        ).toLocaleString()}
                      </>
                    )}
                  </Popup>
                </Marker>
              )}
            </MapContainer>
          </div>

          <div className="location-info">
            <h3>Selected Location</h3>

            {location ? (
              <>
                <p>
                  <strong>Latitude:</strong>{" "}
                  {location.lat.toFixed(6)}
                </p>

                <p>
                  <strong>Longitude:</strong>{" "}
                  {location.lng.toFixed(6)}
                </p>

                <p>
                  <strong>
                    Automatically Detected District:
                  </strong>{" "}
                  <span className="detected-area">
                    {detectedArea}
                  </span>
                </p>

                {districtInfo && (
                  <div className="district-data">
                    <h3>Census 2023 District Data</h3>

                    <p>
                      <strong>Population:</strong>{" "}
                      {Number(
                        districtInfo.population_2023
                      ).toLocaleString()}
                    </p>

                    <p>
                      <strong>Population Density:</strong>{" "}
                      {Number(
                        districtInfo.population_density
                      ).toFixed(2)}{" "}
                      people/km²
                    </p>

                    <p>
                      <strong>Urban Population:</strong>{" "}
                      {Number(
                        districtInfo.urban_proportion
                      ).toFixed(2)}
                      %
                    </p>

                    <p>
                      <strong>District Area:</strong>{" "}
                      {Number(
                        districtInfo.area_sq_km
                      ).toLocaleString()}{" "}
                      km²
                    </p>

                    <p>
                      <strong>
                        Average Household Size:
                      </strong>{" "}
                      {Number(
                        districtInfo.avg_household_size
                      ).toFixed(1)}
                    </p>

                    <p>
                      <strong>
                        Annual Population Growth:
                      </strong>{" "}
                      {Number(
                        districtInfo.annual_growth_rate
                      ).toFixed(2)}
                      %
                    </p>
                  </div>
                )}

                {!districtInfo &&
                  detectedArea &&
                  detectedArea !==
                    "KPK district not detected" && (
                    <p>
                      Is district ka Census data match nahi hua.
                    </p>
                  )}
              </>
            ) : (
              <p>Map par location select karein.</p>
            )}
          </div>

          <div className="district-status">
            <p className={`api-connection ${backendStatus}`}>
              Backend:{" "}
              {backendStatus === "connected"
                ? "Connected"
                : backendStatus === "disconnected"
                  ? "Disconnected - retrying"
                  : "Connecting..."}
            </p>
            {loadingDistricts ? (
              <p>Loading 35 KPK districts...</p>
            ) : (
              <p>
                <strong>{districtsData.length}</strong>{" "}
                KPK districts connected with Census 2023 data.
              </p>
            )}
          </div>

          <div className="budget-section">
            <label htmlFor="budget">
              Your Available Budget (PKR)
            </label>

            <input
              id="budget"
              type="number"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              placeholder="Example: 1500000"
              min="1"
            />
          </div>

          <button
            className="analyze-button"
            onClick={analyzeBusiness}
            disabled={loading}
          >
            {loading
              ? "Analyzing..."
              : "Analyze Business Opportunity"}
          </button>

          {error && <div className="error">{error}</div>}
        </div>

        {result && (
          <div className="results card">
            <h2>AI Recommendation</h2>

            <div className="district-result">
              <h3>
                District:{" "}
                {result.district?.name || "Unknown District"}
              </h3>

              <p>
                <strong>Census 2023 Population:</strong>{" "}
                {Number(
                  result.district?.population_2023 || 0
                ).toLocaleString()}
              </p>

              <p>
                <strong>Population Density:</strong>{" "}
                {Number(
                  result.district?.population_density || 0
                ).toFixed(2)}{" "}
                people/km²
              </p>

              <p>
                <strong>Urban Population:</strong>{" "}
                {Number(
                  result.district?.urban_proportion || 0
                ).toFixed(2)}
                %
              </p>

              <p>
                <strong>Annual Growth:</strong>{" "}
                {Number(
                  result.district?.annual_growth_rate || 0
                ).toFixed(2)}
                %
              </p>

              <p>
                <strong>District Area:</strong>{" "}
                {Number(
                  result.district?.area_sq_km || 0
                ).toLocaleString()}{" "}
                km²
              </p>

              <p>
                <strong>Average Household Size:</strong>{" "}
                {Number(
                  result.district?.avg_household_size || 0
                ).toFixed(1)}
              </p>

              <p>
                <strong>Demand Score:</strong>{" "}
                {Number(
                  result.district?.demand_score || 0
                ).toFixed(2)}
              </p>
            </div>

            {result.best_recommendation && (
              <div className="best-result">
                <h3>Best Match</h3>

                <p>
                  <strong>Business:</strong>{" "}
                  {result.best_recommendation.Business_Type ||
                    "N/A"}
                </p>

                <p>
                  <strong>Required Budget:</strong> Rs{" "}
                  {Number(
                    result.best_recommendation.Budget_Required ||
                      0
                  ).toLocaleString()}
                </p>

                <p>
                  <strong>AI Suitability:</strong>{" "}
                  {Number(
                    result.best_recommendation
                      .Suitable_Probability || 0
                  ).toFixed(2)}
                  %
                </p>

                <p>
                  <strong>Opportunity Score:</strong>{" "}
                  {Number(
                    result.best_recommendation
                      .Opportunity_Score || 0
                  ).toFixed(2)}
                </p>

                <p>
                  <strong>Final Score:</strong>{" "}
                  {Number(
                    result.best_recommendation.Final_Score ||
                      0
                  ).toFixed(2)}
                </p>

                <p>
                  <strong>Competition:</strong>{" "}
                  {result.best_recommendation.Competition ||
                    "N/A"}
                </p>

                <p>
                  <strong>Risk:</strong>{" "}
                  <span
                    className={`risk ${(
                      result.best_recommendation.Risk_Level ||
                      ""
                    ).toLowerCase()}`}
                  >
                    {result.best_recommendation.Risk_Level ||
                      "N/A"}
                  </span>
                </p>
              </div>
            )}

            <h3>Top Recommendations</h3>

            <div className="recommendations">
              {Array.isArray(result.top_3) &&
              result.top_3.length > 0 ? (
                result.top_3.map((business, index) => (
                  <div
                    className="recommendation-card"
                    key={index}
                  >
                    <h4>
                      #{index + 1}{" "}
                      {business.Business_Type || "Business"}
                    </h4>

                    <p>
                      Budget: Rs{" "}
                      {Number(
                        business.Budget_Required || 0
                      ).toLocaleString()}
                    </p>

                    <p>
                      AI Suitability:{" "}
                      {Number(
                        business.Suitable_Probability || 0
                      ).toFixed(2)}
                      %
                    </p>

                    <p>
                      Opportunity:{" "}
                      {Number(
                        business.Opportunity_Score || 0
                      ).toFixed(2)}
                    </p>

                    <p>
                      Final Score:{" "}
                      {Number(
                        business.Final_Score || 0
                      ).toFixed(2)}
                    </p>

                    <p>
                      Competition:{" "}
                      {business.Competition || "N/A"}
                    </p>

                    <p>
                      Risk:{" "}
                      <span
                        className={`risk ${(
                          business.Risk_Level || ""
                        ).toLowerCase()}`}
                      >
                        {business.Risk_Level || "N/A"}
                      </span>
                    </p>
                  </div>
                ))
              ) : (
                <p>
                  No business recommendations available.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;