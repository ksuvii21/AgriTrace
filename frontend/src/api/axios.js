import axios from "axios";
import { auth } from "../config/firebase";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL,

  // Give a cold backend more time to wake up.
  timeout: 30000,

  headers: {
    "Content-Type": "application/json",
  },
});

// ============================================================
// Request interceptor
// ============================================================

apiClient.interceptors.request.use(
  async (config) => {
    const user = auth.currentUser;

    if (user) {
      try {
        const token = await user.getIdToken();

        if (token) {
          config.headers = config.headers || {};
          config.headers.Authorization = `Bearer ${token}`;
        }
      } catch (err) {
        console.warn("Failed to retrieve Firebase ID token", err);
      }
    }

    return config;
  },

  (error) => Promise.reject(error)
);

// ============================================================
// Response interceptor
// ============================================================

apiClient.interceptors.response.use(
  (response) => {
    const data = response.data;

    // Unwrap:
    //
    // {
    //   success: true,
    //   data: ...
    // }
    //
    // into response.data = actual payload.

    if (
      data &&
      typeof data === "object" &&
      data.success === true &&
      Object.hasOwn(data, "data")
    ) {
      response.data = data.data;
    }

    return response;
  },

  async (error) => {
    const { response, config } = error;

    if (!config) {
      return Promise.reject(normalizeError(error));
    }

    // ========================================================
    // 403 = authenticated but not authorized
    // Never retry.
    // ========================================================

    if (response?.status === 403) {
      return Promise.reject(normalizeError(error));
    }

    // ========================================================
    // 401 = possibly expired Firebase token
    // Refresh token once.
    // ========================================================

    const canRefreshToken =
      response?.status === 401 &&
      !config._authRetry &&
      auth.currentUser;

    if (canRefreshToken) {
      config._authRetry = true;

      try {
        const token = await auth.currentUser.getIdToken(true);

        config.headers = config.headers || {};
        config.headers.Authorization = `Bearer ${token}`;

        return apiClient.request(config);
      } catch (refreshErr) {
        console.warn(
          "Token refresh failed after 401",
          refreshErr
        );
      }
    }

    // ========================================================
    // Network / cold-start retry
    // ========================================================

    const status = response?.status;

    const networkFailure = !response;

    const timeoutFailure =
      error.code === "ECONNABORTED" ||
      error.code === "ETIMEDOUT";

    const temporaryServerFailure =
      status === 502 ||
      status === 503 ||
      status === 504;

    const shouldRetry =
      networkFailure ||
      timeoutFailure ||
      temporaryServerFailure;

    // Retry only safe GET requests automatically.
    //
    // We do NOT automatically retry POST/PATCH/PUT/DELETE
    // because that could accidentally create duplicate data.

    const method =
      (config.method || "get").toLowerCase();

    const safeMethod = method === "get";

    if (shouldRetry && safeMethod) {
      config._networkRetryCount =
        config._networkRetryCount || 0;

      const MAX_RETRIES = 3;

      if (config._networkRetryCount < MAX_RETRIES) {
        config._networkRetryCount += 1;

        // 1.5s -> 3s -> 6s
        const delay =
          1500 *
          Math.pow(
            2,
            config._networkRetryCount - 1
          );

        console.warn(
          `[API] Backend unavailable. Retry ${config._networkRetryCount}/${MAX_RETRIES} in ${delay}ms`,
          config.url
        );

        await sleep(delay);

        return apiClient.request(config);
      }
    }

    // ========================================================
    // 401 still present after token refresh
    // ========================================================

    if (
      response?.status === 401 &&
      auth.currentUser
    ) {
      try {
        const { logoutUser } =
          await import("../services/authService");

        await logoutUser();
      } catch (logoutError) {
        console.error(
          "Failed to logout on auth error",
          logoutError
        );
      }
    }

    return Promise.reject(normalizeError(error));
  }
);

// ============================================================
// Normalize API errors
// ============================================================

function normalizeError(error) {
  const response = error.response;

  const status =
    response?.status ?? null;

  const backendMessage =
    response?.data?.message ||
    response?.data?.detail ||
    null;

  let message = backendMessage;

  if (!message) {
    if (
      error.code === "ECONNABORTED" ||
      error.code === "ETIMEDOUT"
    ) {
      message =
        "The AgriTrace server is taking longer than expected to respond.";
    }

    else if (status === null) {
      message =
        "Unable to connect to the AgriTrace server. The server may be starting.";
    }

    else if (status === 400) {
      message =
        "Invalid request. Please check your input.";
    }

    else if (status === 401) {
      message =
        "Your session has expired. Please log in again.";
    }

    else if (status === 403) {
      message =
        "You do not have permission to perform this action.";
    }

    else if (status === 404) {
      message =
        "The requested resource was not found.";
    }

    else if (status === 409) {
      message =
        "This action conflicts with the current state.";
    }

    else if (status === 502) {
      message =
        "The AgriTrace server is starting. Please wait a moment.";
    }

    else if (status === 503) {
      message =
        "The AgriTrace service is temporarily unavailable.";
    }

    else if (status === 504) {
      message =
        "The AgriTrace server took too long to respond.";
    }

    else if (status >= 500) {
      message =
        "Server error - please try again later.";
    }

    else {
      message =
        error.message ||
        "Something went wrong.";
    }
  }

  const normalized = new Error(message);

  normalized.status = status;
  normalized.data = response?.data;
  normalized.code = error.code;

  normalized.isNetworkError =
    status === null;

  return normalized;
}

export default apiClient;