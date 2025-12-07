// index.js
import TelegramBot from "node-telegram-bot-api";
import { config } from "./config.js";
import { SessionService } from "./services/session.service.js";
import { RabbitMQService } from "./services/rabbitmq.service.js";
import { CommandHandler } from "./handlers/command.handler.js";

// ============ INITIALIZATION ============

const bot = new TelegramBot(config.telegram.token, { polling: true });
const sessionService = new SessionService();
const commandHandler = new CommandHandler(bot, sessionService);

// ============ COMMAND HANDLERS ============

// /start dan /help
bot.onText(/^\/start$/, (msg) => commandHandler.handleHelp(msg));
bot.onText(/^\/help$/, (msg) => commandHandler.handleHelp(msg));

// /login YYYY-MM-DD password
bot.onText(/^\/login\s+(\d{4}-\d{2}-\d{2})\s+(.+)$/, (msg, match) =>
  commandHandler.handleLogin(msg, match)
);

// /logout
bot.onText(/^\/logout$/, (msg) => commandHandler.handleLogout(msg));

// /mesin
bot.onText(/^\/mesin$/, (msg) => commandHandler.handleMesin(msg));

// /absen YYYY-MM-DD HH:mm:ss /fp-X /st-Y
bot.onText(
  /^\/absen\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})\s+\/fp-(\d+)\s+\/st-(\d+)$/,
  (msg, match) => commandHandler.handleAbsen(msg, match)
);

// ============ RABBITMQ CONSUMER ============

async function startConsumer() {
  try {
    await RabbitMQService.setupConsumer(async (task) => {
      if (task.type === "fp-presensi") {
        await commandHandler.processAbsenTask(task);
      } else {
        console.log("Unknown task type:", task.type);
      }
    });
  } catch (error) {
    console.error("✗ Consumer tidak dapat dijalankan:", error.message);
    console.log(
      "⚠️  Bot tetap berjalan tanpa RabbitMQ consumer (fallback mode)"
    );
  }
}

// ============ ERROR HANDLERS ============

bot.on("error", (error) => {
  console.error("❌ Bot error:", error);
});

bot.on("polling_error", (error) => {
  console.error("❌ Polling error:", error);
});

// Handle graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n\n🛑 Menerima signal SIGINT, menutup bot...");
  await bot.stopPolling();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\n\n🛑 Menerima signal SIGTERM, menutup bot...");
  await bot.stopPolling();
  process.exit(0);
});

// ============ STARTUP ============

console.log("╔════════════════════════════════════════╗");
console.log("║   🤖 Telegram Bot Absensi v2.0       ║");
console.log("╚════════════════════════════════════════╝");
console.log("");
console.log("✓ Bot sedang dijalankan...");
console.log("✓ Polling Telegram dimulai...");
console.log("⏳ Mencoba menjalankan RabbitMQ consumer...");
console.log("");

startConsumer().then(() => {
  console.log("╔════════════════════════════════════════╗");
  console.log("║   ✅ BOT SIAP DIGUNAKAN               ║");
  console.log("╚════════════════════════════════════════╝");
  console.log("");
  console.log("💡 Ketik /help di chat Telegram untuk melihat perintah");
  console.log("🔄 Tekan Ctrl+C untuk menghentikan bot");
  console.log("");
});
