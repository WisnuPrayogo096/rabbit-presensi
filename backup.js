import TelegramBot from "node-telegram-bot-api";
import amqp from "amqplib";
import fetch from "node-fetch";

// ============ CONFIG ============

// Token bot dari BotFather
const TELEGRAM_TOKEN = "8438653999:AAGT0oHi4QjMzyjf7fuuFALRgTv_ubCS3QI";
// const BASE_URL = "https://api.domaintesting.site";
const BASE_URL = "http://127.0.0.1:8000";

// Konfigurasi RabbitMQ
const RABBIT_URL = "amqp://user:password@10.18.3.73:5672";
const RABBIT_URL_FALLBACK = "amqp://10.18.3.73";
const rabbitConfig = {
  hostname: "10.18.3.73",
  port: 5672,
  username: "rabbituser",
  password: "17082013",
  vhost: "/",
  heartbeat: 30,
};

// ============ BOT & SESSION ============

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// Simpan token per chatId (in-memory)
const sessions = new Map(); // key: chatId, value: { token, user }

// ============ HELPER RABBITMQ ============

async function connectToRabbitMQ() {
  try {
    console.log(
      "Mencoba koneksi ke RabbitMQ server eksternal dengan kredensial..."
    );
    return await amqp.connect(rabbitConfig);
  } catch (error) {
    console.log("Koneksi dengan kredensial gagal, mencoba URL string...");
    try {
      return await amqp.connect(RABBIT_URL);
    } catch (urlError) {
      console.log("Koneksi dengan URL string gagal, mencoba fallback...");
      try {
        return await amqp.connect(RABBIT_URL_FALLBACK);
      } catch (fallbackError) {
        console.error("Gagal koneksi ke RabbitMQ:", fallbackError.message);
        throw new Error("Tidak dapat terhubung ke RabbitMQ server");
      }
    }
  }
}

// task = object JSON bebas, delay dalam detik
async function sendDelayedTask(task, delaySeconds) {
  try {
    const connection = await connectToRabbitMQ();
    const channel = await connection.createChannel();

    const exchange = "delayed_exchange";
    const queue = "delayed_queue";

    await channel.assertExchange(exchange, "x-delayed-message", {
      durable: true,
      arguments: { "x-delayed-type": "direct" },
    });

    await channel.assertQueue(queue, { durable: true });
    await channel.bindQueue(queue, exchange, "routing_key");

    channel.publish(
      exchange,
      "routing_key",
      Buffer.from(JSON.stringify(task)),
      {
        headers: { "x-delay": delaySeconds * 1000 }, // detik -> ms
      }
    );

    console.log(
      `Task queued: type=${task.type} delay=${delaySeconds}s payload=`,
      task
    );
    setTimeout(() => connection.close(), 500);
  } catch (error) {
    console.error("Error dalam sendDelayedTask:", error.message);

    // Fallback: kalau RabbitMQ gagal, eksekusi langsung
    if (task.type === "fp-presensi") {
      await processFpPresensiNow(task);
    }
  }
}

// ============ HELPER API ============

async function loginApi(tgl_lahir, password) {
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
    throw new Error(`Login gagal: ${json.message || "token tidak ditemukan"}`);
  }

  return json.data; // berisi full_name, token, dll.
}

async function getMesinPresensi(token) {
  const res = await fetch(`${BASE_URL}/api/mesin-presensi`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gagal ambil mesin-presensi: ${res.status} - ${text}`);
  }
  return res.json();
}

// Eksekusi FP presensi SEKARANG (tanpa delay) – dipakai di consumer & fallback
async function processFpPresensiNow(task) {
  const { chatId, token, requestBody } = task;

  if (!token) {
    await bot.sendMessage(
      chatId,
      "❌ Token tidak tersedia. Silakan /login ulang."
    );
    return;
  }

  try {
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
      await bot.sendMessage(
        chatId,
        `❌ Gagal kirim absen:\n\`\`\`${JSON.stringify(data, null, 2)}\`\`\``,
        { parse_mode: "Markdown" }
      );
      return;
    }

    await bot.sendMessage(
      chatId,
      `✅ Absen berhasil dikirim:\n\`\`\`${JSON.stringify(
        data,
        null,
        2
      )}\`\`\``,
      { parse_mode: "Markdown" }
    );
  } catch (err) {
    await bot.sendMessage(chatId, `❌ Error saat kirim absen: ${err.message}`);
  }
}

// ============ CONSUMER RABBITMQ ============

async function consume() {
  try {
    const connection = await connectToRabbitMQ();
    const channel = await connection.createChannel();

    const exchange = "delayed_exchange";
    const queue = "delayed_queue";

    await channel.assertExchange(exchange, "x-delayed-message", {
      durable: true,
      arguments: { "x-delayed-type": "direct" },
    });
    await channel.assertQueue(queue, { durable: true });
    await channel.bindQueue(queue, exchange, "routing_key");

    console.log("Consumer RabbitMQ berhasil dijalankan");

    await channel.consume(queue, async (msg) => {
      if (msg !== null) {
        const task = JSON.parse(msg.content.toString());
        console.log("Processing task:", task);

        if (task.type === "fp-presensi") {
          await processFpPresensiNow(task);
        } else {
          console.log("Unknown task type:", task.type);
        }

        channel.ack(msg);
      }
    });
  } catch (error) {
    console.error("Consumer RabbitMQ gagal:", error.message);
    console.log("Bot tetap berjalan tanpa RabbitMQ consumer");
  }
}

// ============ PARSE TANGGAL ============

// Membuat Date dari string "YYYY-MM-DD" + "HH:mm:ss" sebagai WIB (+07:00)
function makeDateWIB(dateStr, timeStr) {
  // Format ISO dengan offset
  const iso = `${dateStr}T${timeStr}+07:00`;
  return new Date(iso);
}

// ============ HANDLER TELEGRAM ============

// 1) LOGIN
// Format command: /login 2002-06-11 password123
bot.onText(/^\/login\s+(\d{4}-\d{2}-\d{2})\s+(.+)$/, async (msg, match) => {
  const chatId = msg.chat.id;
  const tgl_lahir = match[1];
  const password = match[2];

  bot.sendMessage(chatId, "🔐 Sedang mencoba login...");

  try {
    const userData = await loginApi(tgl_lahir, password);
    sessions.set(chatId, {
      token: userData.token,
      user: userData,
    });

    await bot.sendMessage(
      chatId,
      `✅ Login berhasil sebagai *${userData.full_name}* (IDF: ${userData.idf})`,
      { parse_mode: "Markdown" }
    );
  } catch (err) {
    await bot.sendMessage(chatId, `❌ Login gagal: ${err.message}`);
  }
});

// 2) LIHAT MESIN PRESENSI LANGSUNG (tanpa scheduler)
// Command: /mesin
bot.onText(/^\/mesin$/, async (msg) => {
  const chatId = msg.chat.id;
  const session = sessions.get(chatId);

  if (!session?.token) {
    await bot.sendMessage(
      chatId,
      "❌ Kamu belum login. Silakan login dulu dengan:\n`/login YYYY-MM-DD password`",
      { parse_mode: "Markdown" }
    );
    return;
  }

  try {
    const json = await getMesinPresensi(session.token);
    await bot.sendMessage(
      chatId,
      `📟 Daftar mesin presensi:\n\`\`\`${JSON.stringify(json, null, 2)}\`\`\``,
      { parse_mode: "Markdown" }
    );
  } catch (err) {
    await bot.sendMessage(
      chatId,
      `❌ Gagal ambil mesin-presensi: ${err.message}`
    );
  }
});

// 3) SCHEDULER ABSEN
// Format command:
// /absen 2025-12-08 07:58:01 /fp-3 /st-1
//   -> di waktu tsb POST ke /api/fp-presensi/create dengan body:
//      { "id_fp_finger_mesin": 3, "status": 1 }
bot.onText(
  /^\/absen\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})\s+\/fp-(\d+)\s+\/st-(\d+)$/,
  async (msg, match) => {
    const chatId = msg.chat.id;
    const session = sessions.get(chatId);

    if (!session?.token) {
      await bot.sendMessage(
        chatId,
        "❌ Kamu belum login. Silakan login dulu dengan:\n`/login YYYY-MM-DD password`",
        { parse_mode: "Markdown" }
      );
      return;
    }

    const dateStr = match[1]; // YYYY-MM-DD
    const timeStr = match[2]; // HH:mm:ss
    const fpId = parseInt(match[3], 10);
    const status = parseInt(match[4], 10);

    const scheduledAt = makeDateWIB(dateStr, timeStr);
    const now = new Date();

    const diffMs = scheduledAt.getTime() - now.getTime();
    const delaySeconds = Math.floor(diffMs / 1000);

    if (delaySeconds <= 0) {
      await bot.sendMessage(
        chatId,
        "⚠️ Waktu yang kamu masukkan sudah lewat. Gunakan waktu yang lebih besar dari sekarang."
      );
      return;
    }

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
        requestedAt: now.toISOString(),
      },
    };

    await bot.sendMessage(
      chatId,
      `⏳ Jadwal absen dibuat:\n- Tanggal: ${dateStr}\n- Jam: ${timeStr} WIB\n- Mesin: ${fpId}\n- Status: ${status}\n\nAkan dikirim otomatis pada waktu tersebut.`
    );

    await sendDelayedTask(task, delaySeconds);
  }
);

// ============ ERROR HANDLER ============

bot.on("error", (error) => {
  console.error("Bot error:", error);
});

bot.on("polling_error", (error) => {
  console.error("Polling error:", error);
});

// ============ STARTUP ============

console.log("Bot Telegram sedang dijalankan...");
console.log("Mencoba menjalankan consumer RabbitMQ...");
consume();
