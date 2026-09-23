export const formatDate = (
  date,
  options = {}
) => {
  if (!date) return "-";

  const parsedDate =
    date instanceof Date
      ? date
      : new Date(date);

  if (
    Number.isNaN(
      parsedDate.getTime()
    )
  ) {
    return "-";
  }

  const defaultOptions = {
    day: "2-digit",
    month: "short",
    year: "numeric",
  };

  return parsedDate.toLocaleDateString(
    "en-IN",
    {
      ...defaultOptions,
      ...options,
    }
  );
};


export const formatDateTime = (
  date
) => {
  if (!date) return "-";

  const parsedDate =
    new Date(date);

  if (
    Number.isNaN(
      parsedDate.getTime()
    )
  ) {
    return "-";
  }

  return parsedDate.toLocaleString(
    "en-IN",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",

      hour: "2-digit",
      minute: "2-digit",

      hour12: true,
    }
  );
};


export const formatTime = (
  date
) => {
  if (!date) return "-";

  const parsedDate =
    new Date(date);

  if (
    Number.isNaN(
      parsedDate.getTime()
    )
  ) {
    return "-";
  }

  return parsedDate.toLocaleTimeString(
    "en-IN",
    {
      hour: "2-digit",
      minute: "2-digit",

      hour12: true,
    }
  );
};


export const formatRelativeTime = (
  date
) => {
  if (!date) return "-";

  const parsedDate =
    new Date(date);

  const now =
    new Date();

  const difference =
    now.getTime() -
    parsedDate.getTime();

  const seconds =
    Math.floor(
      difference / 1000
    );

  const minutes =
    Math.floor(
      seconds / 60
    );

  const hours =
    Math.floor(
      minutes / 60
    );

  const days =
    Math.floor(
      hours / 24
    );

  if (seconds < 60) {
    return "Just now";
  }

  if (minutes < 60) {
    return `${minutes} min ago`;
  }

  if (hours < 24) {
    return `${hours} hr ago`;
  }

  if (days === 1) {
    return "Yesterday";
  }

  if (days < 7) {
    return `${days} days ago`;
  }

  return formatDate(parsedDate);
};


const unavailableText = "Unavailable";

const isPresent = (value) => {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    return (
      trimmed !== "" &&
      !["null", "undefined"].includes(
        trimmed.toLowerCase()
      )
    );
  }

  return true;
};

const finiteNumber = (value) => {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : null;
};

const validCoordinate = (latitude, longitude) => (
  latitude !== null &&
  longitude !== null &&
  latitude >= -90 &&
  latitude <= 90 &&
  longitude >= -180 &&
  longitude <= 180
);

export const getTelemetryLocationName = (telemetry) => {
  const location = telemetry?.location;

  if (!location || typeof location !== "object") {
    return unavailableText;
  }

  const displayName =
    location.displayName ??
    location.place ??
    location.name;

  if (isPresent(displayName)) {
    return String(displayName).trim();
  }

  const parts = [
    location.locality,
    location.city,
    location.district,
    location.state,
    location.country,
  ]
    .filter(isPresent)
    .map((value) =>
      String(value).trim()
    );

  return parts.length
    ? parts.join(", ")
    : unavailableText;
};

export const formatTelemetryCoordinates = (telemetry) => {
  const latitude = finiteNumber(
    telemetry?.latitude
  );

  const longitude = finiteNumber(
    telemetry?.longitude
  );

  if (!validCoordinate(latitude, longitude)) {
    return unavailableText;
  }

  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
};

export const isValidTelemetryLocation = (telemetry) => (
  telemetry?.gpsValid === true &&
  validCoordinate(
    finiteNumber(telemetry?.latitude),
    finiteNumber(telemetry?.longitude)
  )
);

export const formatTelemetryBoolean = (
  value,
  trueLabel = "Valid",
  falseLabel = "Invalid"
) => {
  if (typeof value !== "boolean") {
    return unavailableText;
  }

  return value ? trueLabel : falseLabel;
};

export const formatTelemetryNumber = (
  value,
  digits = 1,
  suffix = ""
) => {
  const number = finiteNumber(value);

  if (number === null) {
    return unavailableText;
  }

  return `${number.toFixed(digits)}${suffix}`;
};

export const formatTelemetrySatelliteCount = (value) => {
  const number = finiteNumber(value);

  if (number === null) {
    return unavailableText;
  }

  return String(Math.trunc(number));
};

export const formatTelemetryTimeSource = (value) => (
  isPresent(value)
    ? String(value).trim()
    : unavailableText
);

export const getTelemetryTimestamp = (telemetry) => (
  telemetry?.timestamp ||
  telemetry?.receivedAt ||
  telemetry?.createdAt ||
  telemetry?.deviceTimestamp ||
  null
);


export default formatDate;