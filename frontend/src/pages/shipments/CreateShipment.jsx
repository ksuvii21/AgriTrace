import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  FaBox,
  FaLocationDot,
  FaTruck,
  FaTemperatureHalf,
  FaMicrochip,
} from "react-icons/fa6";

import { createShipment } from "../../api/shipmentApi";
import { listDevices } from "../../api/deviceApi";
import LoadingSpinner from "../../components/common/LoadingSpinner";
import EmptyState from "../../components/common/EmptyState";
import { useAuth } from "../../context/AuthContext";

const initialForm = {
  name: "",
  productName: "",
  category: "Vegetables",
  batchId: "",
  quantity: "",
  unit: "kg",
  grade: "Grade A",

  organization: "",
  farmName: "",
  sourceCity: "",
  sourceDistrict: "",
  sourceState: "",
  pickupLocation: "",

  receiverOrganization: "",
  receiverName: "",
  destinationCity: "",
  destinationState: "",
  contactPerson: "",
  phone: "",

  departureDate: "",
  departureTime: "",
  deliveryDate: "",
  transportType: "Refrigerated Truck",
  vehicleNumber: "",
  driverName: "",

  temperatureMin: 8,
  temperatureMax: 28,
  humidityMin: 40,
  humidityMax: 80,
  gasThreshold: 50,

  deviceId: "",
};

function CreateShipment() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const [form, setForm] = useState(initialForm);
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    const fetchDevices = async () => {
      try {
        const data = await listDevices();
        setDevices(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("Failed to load devices", err);
      } finally {
        setLoading(false);
      }
    };
    fetchDevices();
  }, []);

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const payload = {
        name: form.name || undefined,
        product: form.productName,
        category: form.category,
        batchId: form.batchId,
        quantity: form.quantity,
        unit: form.unit,
        grade: form.grade,
        source: form.sourceCity,
        sourceDistrict: form.sourceDistrict,
        sourceState: form.sourceState,
        destination: form.destinationCity,
        destinationState: form.destinationState,
        pickupLocation: form.pickupLocation,
        contactPerson: form.contactPerson,
        phone: form.phone,
        vehicle: form.vehicleNumber,
        driver: form.driverName,
        departureDate: form.departureDate,
        departureTime: form.departureTime,
        deliveryDate: form.deliveryDate,
        transportType: form.transportType,
        startDate: form.departureDate,
        eta: form.deliveryDate,
        thresholds: {
          temperature: {
            min: Number(form.temperatureMin) || null,
            max: Number(form.temperatureMax) || null,
          },
          humidity: {
            min: Number(form.humidityMin) || null,
            max: Number(form.humidityMax) || null,
          },
          gasLevel: {
            max: Number(form.gasThreshold) || null,
          },
        },
        deviceId: form.deviceId || undefined,
      };

      const shipment = await createShipment(payload);
      setSuccess(`Shipment ${shipment.shipmentId || shipment.trackingId || ""} created successfully.`);
      setTimeout(() => {
        navigate("/shipments/active");
      }, 1500);
    } catch (err) {
      console.error("Create shipment error", err);
      setError(err.message || "Failed to create shipment");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="page-container">
      {error && (
        <EmptyState
          title="Creation failed"
          description={error}
          action={<button className="btn primary small" onClick={() => setError(null)}>Dismiss</button>}
        />
      )}
      {success && (
        <div className="success-banner">
          {success}
        </div>
      )}

      <form className="form-shell" onSubmit={handleSubmit}>
        <FormSection
          icon={<FaBox />}
          title="Product Information"
        >
          <Input
            label="Shipment Name"
            name="name"
            value={form.name}
            onChange={handleChange}
            placeholder="e.g., Fresh tomatoes Sarnath to Lanka"
          />

          <Input
            label="Product Name"
            name="productName"
            value={form.productName}
            onChange={handleChange}
            placeholder="Fresh Tomatoes"
            required
          />

          <Select
            label="Product Category"
            name="category"
            value={form.category}
            onChange={handleChange}
            options={[
              "Vegetables",
              "Fruits",
              "Grains",
              "Dairy",
              "Spices",
              "Other",
            ]}
          />

          <Input
            label="Batch ID"
            name="batchId"
            value={form.batchId}
            onChange={handleChange}
            placeholder="Auto-generated if left blank"
          />

          <Input
            label="Quantity"
            name="quantity"
            value={form.quantity}
            onChange={handleChange}
            type="number"
            placeholder="500"
          />

          <Select
            label="Unit"
            name="unit"
            value={form.unit}
            onChange={handleChange}
            options={[
              "kg",
              "quintal",
              "tonnes",
              "crates",
            ]}
          />

          <Select
            label="Quality Grade"
            name="grade"
            value={form.grade}
            onChange={handleChange}
            options={[
              "Grade A",
              "Grade B",
              "Grade C",
            ]}
          />
        </FormSection>

        <FormSection
          icon={<FaLocationDot />}
          title="Origin Details"
        >
          <Input
            label="Farm Name"
            name="farmName"
            value={form.farmName}
            onChange={handleChange}
          />

          <Input
            label="Village / City"
            name="sourceCity"
            value={form.sourceCity}
            onChange={handleChange}
          />

          <Input
            label="District"
            name="sourceDistrict"
            value={form.sourceDistrict}
            onChange={handleChange}
          />

          <Input
            label="State"
            name="sourceState"
            value={form.sourceState}
            onChange={handleChange}
          />

          <Input
            label="Pickup Location"
            name="pickupLocation"
            value={form.pickupLocation}
            onChange={handleChange}
          />
        </FormSection>

        <FormSection
          icon={<FaLocationDot />}
          title="Destination Details"
        >
          <Input
            label="Receiver Organization"
            name="receiverOrganization"
            value={form.receiverOrganization}
            onChange={handleChange}
          />

          <Input
            label="Warehouse / Retailer"
            name="receiverName"
            value={form.receiverName}
            onChange={handleChange}
          />

          <Input
            label="Destination City"
            name="destinationCity"
            value={form.destinationCity}
            onChange={handleChange}
          />

          <Input
            label="State"
            name="destinationState"
            value={form.destinationState}
            onChange={handleChange}
          />

          <Input
            label="Contact Person"
            name="contactPerson"
            value={form.contactPerson}
            onChange={handleChange}
          />

          <Input
            label="Phone"
            name="phone"
            value={form.phone}
            onChange={handleChange}
          />
        </FormSection>

        <FormSection
          icon={<FaTruck />}
          title="Shipment Information"
        >
          <Input
            label="Departure Date"
            type="date"
            name="departureDate"
            value={form.departureDate}
            onChange={handleChange}
          />

          <Input
            label="Departure Time"
            type="time"
            name="departureTime"
            value={form.departureTime}
            onChange={handleChange}
          />

          <Input
            label="Expected Delivery Date"
            type="date"
            name="deliveryDate"
            value={form.deliveryDate}
            onChange={handleChange}
          />

          <Select
            label="Transport Type"
            name="transportType"
            value={form.transportType}
            onChange={handleChange}
            options={[
              "Refrigerated Truck",
              "Open Truck",
              "Van",
              "Rail",
            ]}
          />

          <Input
            label="Vehicle Number"
            name="vehicleNumber"
            value={form.vehicleNumber}
            onChange={handleChange}
          />

          <Input
            label="Driver Name"
            name="driverName"
            value={form.driverName}
            onChange={handleChange}
          />
        </FormSection>

        <FormSection
          icon={<FaTemperatureHalf />}
          title="Environmental Thresholds"
        >
          <Input
            label="Temperature Min °C"
            type="number"
            name="temperatureMin"
            value={form.temperatureMin}
            onChange={handleChange}
          />

          <Input
            label="Temperature Max °C"
            type="number"
            name="temperatureMax"
            value={form.temperatureMax}
            onChange={handleChange}
          />

          <Input
            label="Humidity Min %"
            type="number"
            name="humidityMin"
            value={form.humidityMin}
            onChange={handleChange}
          />

          <Input
            label="Humidity Max %"
            type="number"
            name="humidityMax"
            value={form.humidityMax}
            onChange={handleChange}
          />

          <Input
            label="Gas Threshold"
            type="number"
            name="gasThreshold"
            value={form.gasThreshold}
            onChange={handleChange}
          />
        </FormSection>

        <FormSection
          icon={<FaMicrochip />}
          title="Assign IoT Device"
        >
          <Select
            label="Available Device"
            name="deviceId"
            value={form.deviceId}
            onChange={handleChange}
            options={[
              "",
              ...devices
                .filter((device) => !device.currentShipmentId)
                .map((device) => device.deviceId || device.id),
            ]}
          />
        </FormSection>

        <div className="form-actions">
          <button
            type="submit"
            className="btn primary"
            disabled={submitting || !(role === "FARMER" || role === "ADMIN")}
          >
            {submitting ? "Creating..." : "Create Shipment"}
          </button>
          {(role !== "FARMER" && role !== "ADMIN") && (
            <p>You are not authorized to create shipments.</p>
          )}
        </div>
      </form>
    </div>
  );
}

function FormSection({ icon, title, children }) {
  return (
    <section className="card form-section">
      <div className="section-head">
        <span>{icon}</span>
        <h3>{title}</h3>
      </div>

      <div className="form-grid">
        {children}
      </div>
    </section>
  );
}

function Input({
  label,
  name,
  value,
  onChange,
  type = "text",
  ...props
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        {...props}
      />
    </div>
  );
}

function Select({
  label,
  name,
  value,
  onChange,
  options,
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <select
        name={name}
        value={value}
        onChange={onChange}
      >
        {options.map((option) => (
          <option
            value={option}
            key={option || "none"}
          >
            {option || "Select"}
          </option>
        ))}
      </select>
    </div>
  );
}

export default CreateShipment;
