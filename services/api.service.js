// services/api.service.js
import fetch from "node-fetch";
import { config } from "../config.js";

const BASE_URL = config.api.baseUrl;

export class ApiService {
  static async login(tgl_lahir, password) {
    const res = await fetch(`${BASE_URL}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tgl_lahir, password }),
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
    const res = await fetch(`${BASE_URL}/api/logout`, {
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
    const res = await fetch(`${BASE_URL}/api/mesin-presensi`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Gagal ambil mesin-presensi: ${res.status} - ${text}`);
    }

    return res.json();
  }

  static async createFpPresensi(token, requestBody) {
    const res = await fetch(`${BASE_URL}/api/fp-presensi/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(requestBody),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(JSON.stringify(data, null, 2));
    }

    return data;
  }
}
