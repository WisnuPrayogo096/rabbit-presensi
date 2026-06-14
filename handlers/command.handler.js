// handlers/command.handler.js
import { ApiService } from "../services/api.service.js";
import { RabbitMQService } from "../services/rabbitmq.service.js";
import { dbService } from "../services/database.service.js";
import { MessageFormatter } from "../utils/formatter.js";
import { DateHelper } from "../utils/date.js";

export class CommandHandler {
  constructor(bot, sessionService) {
    this.bot = bot;
    this.sessionService = sessionService;
  }

  /**
   * Helper: kirim pesan ke Telegram dengan error handling
   */
  async _sendMessage(chatId, text, options = {}) {
    try {
      await this.bot.sendMessage(chatId, text, options);
    } catch (err) {
      console.error(`Gagal mengirim pesan ke chatId ${chatId}:`, err.message);
    }
  }

  /**
   * Handler untuk command /login
   */
  async handleLogin(msg, match) {
    const chatId = msg.chat.id;
    const no_telp = match[1].trim();

    await this._sendMessage(chatId, "🔐 Sedang mencoba login...");

    try {
      const userData = await ApiService.login(no_telp);
      this.sessionService.set(chatId, userData);

      await this._sendMessage(
        chatId,
        MessageFormatter.formatLoginSuccess(userData),
        { parse_mode: "Markdown" }
      );
    } catch (err) {
      await this._sendMessage(chatId, `❌ Login gagal: ${err.message}`);
    }
  }

  /**
   * Handler untuk command /logout
   */
  async handleLogout(msg) {
    const chatId = msg.chat.id;
    const session = this.sessionService.get(chatId);

    if (!session?.token) {
      await this._sendMessage(
        chatId,
        "❌ Anda belum login. Tidak ada sesi yang perlu di-logout."
      );
      return;
    }

    await this._sendMessage(chatId, "🔓 Sedang logout...");

    try {
      await ApiService.logout(session.token);
      this.sessionService.delete(chatId);

      await this._sendMessage(
        chatId,
        MessageFormatter.formatLogoutSuccess(),
        { parse_mode: "Markdown" }
      );
    } catch (err) {
      // Tetap hapus sesi lokal meskipun API error
      this.sessionService.delete(chatId);
      await this._sendMessage(
        chatId,
        `⚠️ Logout dari server gagal, tapi sesi lokal telah dihapus.\nError: ${err.message}`
      );
    }
  }

  /**
   * Handler untuk command /mesin
   */
  async handleMesin(msg) {
    const chatId = msg.chat.id;
    const session = this.sessionService.get(chatId);

    if (!session?.token) {
      await this._sendMessage(
        chatId,
        "❌ Anda belum login. Silakan login terlebih dahulu:\n`/login <no_telp>`",
        { parse_mode: "Markdown" }
      );
      return;
    }

    try {
      const data = await ApiService.getMesinPresensi(session.token);
      await this._sendMessage(
        chatId,
        MessageFormatter.formatMesinPresensi(data),
        { parse_mode: "Markdown" }
      );
    } catch (err) {
      await this._sendMessage(
        chatId,
        `❌ Gagal mengambil data mesin presensi: ${err.message}`
      );
    }
  }

  /**
   * Handler untuk command /absen
   */
  async handleAbsen(msg, match) {
    const chatId = msg.chat.id;
    const session = this.sessionService.get(chatId);

    if (!session?.token) {
      await this._sendMessage(
        chatId,
        "❌ Anda belum login. Silakan login terlebih dahulu:\n`/login <no_telp>`",
        { parse_mode: "Markdown" }
      );
      return;
    }

    const dateStr = match[1]; // YYYY-MM-DD
    const timeStr = match[2]; // HH:mm:ss
    const fpId = parseInt(match[3], 10);
    const status = parseInt(match[4], 10);

    const scheduledAt = DateHelper.makeDateWIB(dateStr, timeStr);

    if (DateHelper.isPastTime(scheduledAt)) {
      await this._sendMessage(
        chatId,
        "⚠️ Waktu yang Anda masukkan sudah lewat. Gunakan waktu di masa depan."
      );
      return;
    }

    const delaySeconds = DateHelper.calculateDelaySeconds(scheduledAt);
    const scheduleId = Date.now().toString();

    const task = {
      type: "fp-presensi",
      chatId,
      token: session.token,
      scheduleId,
      requestBody: {
        id_fp_finger_mesin: fpId,
        status: status,
      },
      meta: {
        scheduledAt: scheduledAt.toISOString(),
        requestedAt: new Date().toISOString(),
      },
    };

    dbService.addSchedule(chatId, {
      id: scheduleId,
      dateStr,
      timeStr,
      fpId,
      status,
    });

    await this._sendMessage(
      chatId,
      MessageFormatter.formatAbsenScheduled(dateStr, timeStr, fpId, status),
      { parse_mode: "Markdown" }
    );

    const success = await RabbitMQService.sendDelayedTask(task, delaySeconds);

    if (!success) {
      await this._sendMessage(
        chatId,
        "⚠️ RabbitMQ tidak tersedia. Absensi akan dicoba langsung saat waktu tiba (fallback mode)."
      );
      // Fallback: gunakan setTimeout (wrapped with .catch to prevent unhandled rejection)
      setTimeout(() => {
        this.processAbsenTask(task).catch((err) => {
          console.error("Fallback processAbsenTask error:", err.message);
        });
      }, delaySeconds * 1000);
    }
  }

  /**
   * Handler untuk command /jadwal
   */
  async handleJadwal(msg) {
    const chatId = msg.chat.id;
    const session = this.sessionService.get(chatId);

    if (!session?.token) {
      await this._sendMessage(
        chatId,
        "❌ Anda belum login. Silakan login terlebih dahulu:\n`/login <no_telp>`",
        { parse_mode: "Markdown" }
      );
      return;
    }

    const schedules = await dbService.getSchedulesByChatId(chatId);
    await this._sendMessage(
      chatId,
      MessageFormatter.formatJadwalList(schedules),
      { parse_mode: "Markdown" }
    );
  }

  /**
   * Handler untuk command /hapus
   */
  async handleHapus(msg, match) {
    const chatId = msg.chat.id;
    const session = this.sessionService.get(chatId);

    if (!session?.token) {
      await this._sendMessage(
        chatId,
        "❌ Anda belum login. Silakan login terlebih dahulu:\n`/login <no_telp>`",
        { parse_mode: "Markdown" }
      );
      return;
    }

    const nomorUrut = parseInt(match[1], 10);

    if (isNaN(nomorUrut) || nomorUrut < 1) {
      await this._sendMessage(
        chatId,
        "⚠️ Format salah. Gunakan: `/hapus <nomor_urut>`\nContoh: `/hapus 1`\n\nLihat daftar jadwal dengan /jadwal",
        { parse_mode: "Markdown" }
      );
      return;
    }

    const schedules = await dbService.getSchedulesByChatId(chatId);

    if (!schedules || schedules.length === 0) {
      await this._sendMessage(
        chatId,
        "📋 Tidak ada jadwal absen yang bisa dihapus."
      );
      return;
    }

    if (nomorUrut > schedules.length) {
      await this._sendMessage(
        chatId,
        `⚠️ Nomor urut tidak valid. Hanya ada ${schedules.length} jadwal.\nLihat daftar jadwal dengan /jadwal`
      );
      return;
    }

    const scheduleToDelete = schedules[nomorUrut - 1];
    const deleted = await dbService.removeScheduleByChatId(chatId, scheduleToDelete.id);

    if (deleted) {
      const statusText = scheduleToDelete.status === 0 ? "Masuk" : scheduleToDelete.status === 1 ? "Keluar" : "Lainnya";
      await this._sendMessage(
        chatId,
        `✅ *Jadwal Berhasil Dihapus*\n\n` +
          `📅 ${scheduleToDelete.dateStr} 🕐 ${scheduleToDelete.timeStr} WIB\n` +
          `📟 Mesin: ${scheduleToDelete.fpId} | 📊 Status: ${statusText}\n\n` +
          `Absensi otomatis untuk jadwal ini telah dibatalkan.`,
        { parse_mode: "Markdown" }
      );
    } else {
      await this._sendMessage(
        chatId,
        "❌ Gagal menghapus jadwal. Jadwal mungkin sudah dieksekusi atau tidak ditemukan."
      );
    }
  }

  /**
   * Handler untuk command /help
   */
  async handleHelp(msg) {
    const chatId = msg.chat.id;
    await this._sendMessage(chatId, MessageFormatter.formatHelp(), {
      parse_mode: "Markdown",
    });
  }

  /**
   * Proses task absensi (dipanggil dari consumer atau fallback)
   */
  async processAbsenTask(task) {
    const { chatId, token, requestBody, scheduleId } = task;

    // Check if schedule was cancelled by user before execution
    const existingSchedule = await dbService.getScheduleById(scheduleId);
    if (!existingSchedule) {
      console.log(`Schedule ${scheduleId} sudah dihapus/dibatalkan, skip eksekusi.`);
      return;
    }

    if (!token) {
      await this._sendMessage(
        chatId,
        "❌ Token tidak tersedia. Silakan login ulang dengan /login"
      );
      dbService.removeSchedule(scheduleId);
      return;
    }

    const maxRetries = 3;
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const data = await ApiService.createFpPresensi(token, requestBody);
        await this._sendMessage(
          chatId,
          MessageFormatter.formatAbsenSuccess(data),
          { parse_mode: "Markdown" }
        );
        dbService.removeSchedule(scheduleId);
        return; // Success — exit
      } catch (err) {
        lastError = err;
        
        // Handle 401 Unauthorized explicitly
        if (err.message.includes("HTTP 401")) {
          console.error("Token expired untuk chatId:", chatId);
          await this._sendMessage(
            chatId,
            "⚠️ *Sesi Berakhir*\n\nToken login Anda sudah tidak valid (Expired).\nSilakan lakukan `/login` kembali sebelum melakukan absen.",
            { parse_mode: "Markdown" }
          );
          this.sessionService.delete(chatId);
          dbService.removeSchedule(scheduleId);
          return;
        }

        console.error(
          `✗ Attempt ${attempt}/${maxRetries} gagal untuk fp-presensi:`,
          err.message
        );

        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
          console.log(`⏳ Retry dalam ${delay / 1000}s...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    // All retries exhausted
    await this._sendMessage(
      chatId,
      MessageFormatter.formatAbsenError(
        `Gagal setelah ${maxRetries} percobaan: ${lastError?.message || "Unknown error"}`
      ),
      { parse_mode: "Markdown" }
    );
    dbService.removeSchedule(scheduleId);
  }
}
