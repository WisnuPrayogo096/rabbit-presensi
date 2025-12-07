// services/session.service.js
import { config } from "../config.js";

export class SessionService {
  constructor() {
    this.sessions = new Map(); // chatId -> { token, user, loginTime, warningScheduled }
    this.warningTimeouts = new Map(); // chatId -> timeoutId
  }

  set(chatId, userData, bot) {
    const loginTime = new Date();

    this.sessions.set(chatId, {
      token: userData.token,
      user: userData,
      loginTime: loginTime,
      warningScheduled: false,
    });

    // Schedule warning 1 hari sebelum expired (hari ke-31)
    this.scheduleExpiryWarning(chatId, loginTime, bot);

    return true;
  }

  get(chatId) {
    return this.sessions.get(chatId);
  }

  delete(chatId) {
    // Hapus warning timeout jika ada
    this.clearWarningTimeout(chatId);
    return this.sessions.delete(chatId);
  }

  has(chatId) {
    return this.sessions.has(chatId);
  }

  scheduleExpiryWarning(chatId, loginTime, bot) {
    // Clear existing timeout
    this.clearWarningTimeout(chatId);

    const expiryDays = config.session.tokenExpiryDays;
    const warningBeforeDays = config.session.warningBeforeDays;

    // Hitung waktu untuk peringatan (31 hari setelah login)
    const warningTime = new Date(loginTime);
    warningTime.setDate(
      warningTime.getDate() + (expiryDays - warningBeforeDays)
    );

    const now = new Date();
    const msUntilWarning = warningTime.getTime() - now.getTime();

    if (msUntilWarning > 0) {
      const timeoutId = setTimeout(async () => {
        const session = this.get(chatId);
        if (session && !session.warningScheduled) {
          session.warningScheduled = true;

          await bot.sendMessage(
            chatId,
            "⚠️ *Peringatan Token*\n\n" +
              `Token login Anda akan expired dalam ${warningBeforeDays} hari.\n\n` +
              "Silakan lakukan `/logout` dan login kembali untuk memperbarui token Anda.",
            { parse_mode: "Markdown" }
          );
        }
      }, msUntilWarning);

      this.warningTimeouts.set(chatId, timeoutId);
      console.log(
        `✓ Warning dijadwalkan untuk chatId ${chatId} pada ${warningTime.toISOString()}`
      );
    }
  }

  clearWarningTimeout(chatId) {
    const timeoutId = this.warningTimeouts.get(chatId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      this.warningTimeouts.delete(chatId);
    }
  }

  isTokenExpired(chatId) {
    const session = this.get(chatId);
    if (!session) return true;

    const now = new Date();
    const expiryTime = new Date(session.loginTime);
    expiryTime.setDate(expiryTime.getDate() + config.session.tokenExpiryDays);

    return now >= expiryTime;
  }
}
