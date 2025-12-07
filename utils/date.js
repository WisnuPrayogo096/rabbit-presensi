// utils/date.js

export class DateHelper {
  /**
   * Membuat Date object dari string tanggal dan waktu dalam timezone WIB (+07:00)
   * @param {string} dateStr - Format: YYYY-MM-DD
   * @param {string} timeStr - Format: HH:mm:ss
   * @returns {Date}
   */
  static makeDateWIB(dateStr, timeStr) {
    const iso = `${dateStr}T${timeStr}+07:00`;
    return new Date(iso);
  }

  /**
   * Hitung delay dalam detik dari sekarang hingga waktu target
   * @param {Date} targetDate
   * @returns {number} delay dalam detik
   */
  static calculateDelaySeconds(targetDate) {
    const now = new Date();
    const diffMs = targetDate.getTime() - now.getTime();
    return Math.floor(diffMs / 1000);
  }

  /**
   * Validasi apakah waktu target sudah lewat
   * @param {Date} targetDate
   * @returns {boolean}
   */
  static isPastTime(targetDate) {
    return targetDate.getTime() <= new Date().getTime();
  }
}
