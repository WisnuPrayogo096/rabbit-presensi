// services/api.service.js
import fetch from "node-fetch";
import { config } from "../config.js";

const BASE_URL = config.api.baseUrl;
const REQUEST_TIMEOUT_MS = 30000; // 30 seconds

export class ApiService {
  /**
   * Helper: fetch with timeout and error wrapping
   */
  static async _fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      return res;
    } catch (error) {
      if (error.name === "AbortError") {
        throw new Error(`Request timeout setelah ${REQUEST_TIMEOUT_MS / 1000}s: ${url}`);
      }
      // Network errors (ECONNREFUSED, ETIMEDOUT, ECONNRESET, etc.)
      throw new Error(`Network error ke ${url}: ${error.message}`);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  static async login(no_telp) {
    const res = await this._fetchWithTimeout(`${BASE_URL}/api/login-number`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ no_telp }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Login gagal: HTTP ${res.status} - ${text}`);
    }

    const json = await res.json();
    if (json.code !== 200 || !json.data?.token) {
      throw new Error(
        `Login gagal: ${json.message || "token tidak ditemukan"}`
      );
    }

    return json.data;
  }

  static async logout(token) {
    const res = await this._fetchWithTimeout(`${BASE_URL}/api/logout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Logout gagal: HTTP ${res.status} - ${text}`);
    }

    const json = await res.json();
    return json;
  }

  static async getMesinPresensi(token) {
    const res = await this._fetchWithTimeout(`${BASE_URL}/api/mesin-presensi`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Gagal ambil mesin-presensi: ${res.status} - ${text}`);
    }

    return res.json();
  }

  static async createFpPresensi(token, requestBody) {
    const res = await this._fetchWithTimeout(`${BASE_URL}/api/fp-presensi/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!res.ok) {
      let errorMsg = `HTTP ${res.status}`;
      try {
        const data = await res.json();
        errorMsg = JSON.stringify(data, null, 2);
      } catch (e) {
        errorMsg = await res.text();
      }
      throw new Error(errorMsg);
    }

    return res.json();
  }
}

