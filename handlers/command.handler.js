// handlers/command.handler.js
import { ApiService } from "../services/api.service.js";
import { RabbitMQService } from "../services/rabbitmq.service.js";
import { MessageFormatter } from "../utils/formatter.js";
import { DateHelper } from "../utils/date.js";

export class CommandHandler {
  constructor(bot, sessionService) {
    this.bot = bot;
    this.sessionService = sessionService;
  }

  /**
   * Handler untuk command /login
   */
  async handleLogin(msg, match) {
    const chatId = msg.chat.id;
    const tgl_lahir = match[1];
    const password = match[2];

    await this.bot.sendMessage(chatId, "🔐 Sedang mencoba login...");

    try {
      const userData = await ApiService.login(tgl_lahir, password);
      this.sessionService.set(chatId, userData, this.bot);

      await this.bot.sendMessage(
        chatId,
        MessageFormatter.formatLoginSuccess(userData),
        { parse_mode: "Markdown" }
      );
    } catch (err) {
      await this.bot.sendMessage(chatId, `❌ Login gagal: ${err.message}`);
    }
  }

  /**
   * Handler untuk command /logout
   */
  async handleLogout(msg) {
    const chatId = msg.chat.id;
    const session = this.sessionService.get(chatId);

    if (!session?.token) {
      await this.bot.sendMessage(
        chatId,
        "❌ Anda belum login. Tidak ada sesi yang perlu di-logout."
      );
      return;
    }

    await this.bot.sendMessage(chatId, "🔓 Sedang logout...");

    try {
      await ApiService.logout(session.token);
      this.sessionService.delete(chatId);

      await this.bot.sendMessage(
        chatId,
        MessageFormatter.formatLogoutSuccess(),
        { parse_mode: "Markdown" }
      );
    } catch (err) {
      // Tetap hapus sesi lokal meskipun API error
      this.sessionService.delete(chatId);
      await this.bot.sendMessage(
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
      await this.bot.sendMessage(
        chatId,
        "❌ Anda belum login. Silakan login terlebih dahulu:\n`/login YYYY-MM-DD password`",
        { parse_mode: "Markdown" }
      );
      return;
    }

    try {
      const data = await ApiService.getMesinPresensi(session.token);
      await this.bot.sendMessage(
        chatId,
        MessageFormatter.formatMesinPresensi(data),
        { parse_mode: "Markdown" }
      );
    } catch (err) {
      await this.bot.sendMessage(
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
      await this.bot.sendMessage(
        chatId,
        "❌ Anda belum login. Silakan login terlebih dahulu:\n`/login YYYY-MM-DD password`",
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
      await this.bot.sendMessage(
        chatId,
        "⚠️ Waktu yang Anda masukkan sudah lewat. Gunakan waktu di masa depan."
      );
      return;
    }

    const delaySeconds = DateHelper.calculateDelaySeconds(scheduledAt);

    const task = {
      type: "fp-presensi",
      chatId,
      token: session.token,
      requestBody: {
        id_fp_finger_mesin: fpId,
        status: status,
      },
      meta: {
        scheduledAt: scheduledAt.toISOString(),
        requestedAt: new Date().toISOString(),
      },
    };

    await this.bot.sendMessage(
      chatId,
      MessageFormatter.formatAbsenScheduled(dateStr, timeStr, fpId, status),
      { parse_mode: "Markdown" }
    );

    const success = await RabbitMQService.sendDelayedTask(task, delaySeconds);

    if (!success) {
      await this.bot.sendMessage(
        chatId,
        "⚠️ RabbitMQ tidak tersedia. Absensi akan dicoba langsung saat waktu tiba (fallback mode)."
      );
      // Fallback: gunakan setTimeout
      setTimeout(async () => {
        await this.processAbsenTask(task);
      }, delaySeconds * 1000);
    }
  }

  /**
   * Handler untuk command /help
   */
  async handleHelp(msg) {
    const chatId = msg.chat.id;
    await this.bot.sendMessage(chatId, MessageFormatter.formatHelp(), {
      parse_mode: "Markdown",
    });
  }

  /**
   * Proses task absensi (dipanggil dari consumer atau fallback)
   */
  async processAbsenTask(task) {
    const { chatId, token, requestBody } = task;

    if (!token) {
      await this.bot.sendMessage(
        chatId,
        "❌ Token tidak tersedia. Silakan login ulang dengan /login"
      );
      return;
    }

    try {
      const data = await ApiService.createFpPresensi(token, requestBody);
      await this.bot.sendMessage(
        chatId,
        MessageFormatter.formatAbsenSuccess(data),
        { parse_mode: "Markdown" }
      );
    } catch (err) {
      await this.bot.sendMessage(
        chatId,
        MessageFormatter.formatAbsenError(err.message),
        { parse_mode: "Markdown" }
      );
    }
  }
}
