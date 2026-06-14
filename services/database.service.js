// services/database.service.js
import sqlite3 from "sqlite3";
import path from "path";

const DB_PATH = path.resolve(process.cwd(), "schedules.db");

class DatabaseService {
  constructor() {
    this.db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error("Gagal terhubung ke database SQLite:", err.message);
      } else {
        console.log("✓ Terhubung ke database SQLite");
        this._initializeTables();
      }
    });
  }

  _initializeTables() {
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS schedules (
        id TEXT PRIMARY KEY,
        chat_id INTEGER NOT NULL,
        date_str TEXT NOT NULL,
        time_str TEXT NOT NULL,
        fp_id INTEGER NOT NULL,
        status INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;
    this.db.run(createTableQuery, (err) => {
      if (err) {
        console.error("Gagal membuat tabel schedules:", err.message);
      }
    });
  }

  addSchedule(chatId, schedule) {
    const query = `
      INSERT INTO schedules (id, chat_id, date_str, time_str, fp_id, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    this.db.run(
      query,
      [
        schedule.id,
        chatId,
        schedule.dateStr,
        schedule.timeStr,
        schedule.fpId,
        schedule.status,
      ],
      (err) => {
        if (err) {
          console.error("Gagal menyimpan jadwal ke database:", err.message);
        }
      }
    );
  }

  removeSchedule(scheduleId) {
    const query = `DELETE FROM schedules WHERE id = ?`;
    this.db.run(query, [scheduleId], (err) => {
      if (err) {
        console.error("Gagal menghapus jadwal dari database:", err.message);
      }
    });
  }

  removeScheduleByChatId(chatId, scheduleId) {
    return new Promise((resolve, reject) => {
      const query = `DELETE FROM schedules WHERE id = ? AND chat_id = ?`;
      this.db.run(query, [scheduleId, chatId], function (err) {
        if (err) {
          console.error("Gagal menghapus jadwal:", err.message);
          resolve(false);
        } else {
          resolve(this.changes > 0);
        }
      });
    });
  }

  getScheduleById(scheduleId) {
    return new Promise((resolve, reject) => {
      const query = `SELECT * FROM schedules WHERE id = ?`;
      this.db.get(query, [scheduleId], (err, row) => {
        if (err) {
          console.error("Gagal mengambil jadwal:", err.message);
          resolve(null);
        } else {
          resolve(row || null);
        }
      });
    });
  }

  getSchedulesByChatId(chatId) {
    return new Promise((resolve, reject) => {
      const query = `SELECT * FROM schedules WHERE chat_id = ? ORDER BY date_str ASC, time_str ASC`;
      this.db.all(query, [chatId], (err, rows) => {
        if (err) {
          console.error("Gagal mengambil jadwal dari database:", err.message);
          resolve([]); // Return array kosong jika gagal
        } else {
          // Mapping camelCase agar sama dengan yang sebelumnya di memori
          resolve(
            rows.map((row) => ({
              id: row.id,
              dateStr: row.date_str,
              timeStr: row.time_str,
              fpId: row.fp_id,
              status: row.status,
            }))
          );
        }
      });
    });
  }
}

export const dbService = new DatabaseService();
