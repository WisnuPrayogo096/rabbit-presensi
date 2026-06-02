// services/rabbitmq.service.js
import amqp from "amqplib";
import { config } from "../config.js";

export class RabbitMQService {
  static _consumerHandler = null;
  static _reconnectAttempts = 0;
  static _maxReconnectAttempts = 10;
  static _reconnecting = false;

  static async connect() {
    try {
      console.log("Mencoba koneksi ke RabbitMQ dengan kredensial utama...");
      return await amqp.connect(config.rabbitmq.primary);
    } catch (error) {
      console.log("Koneksi kredensial utama gagal, mencoba URL fallback...");
      try {
        return await amqp.connect(config.rabbitmq.fallbackUrl);
      } catch (urlError) {
        console.log("Koneksi URL fallback gagal, mencoba fallback simple...");
        try {
          return await amqp.connect(config.rabbitmq.fallbackSimple);
        } catch (fallbackError) {
          console.error("Semua koneksi RabbitMQ gagal:", fallbackError.message);
          throw new Error("Tidak dapat terhubung ke RabbitMQ server");
        }
      }
    }
  }

  static async sendDelayedTask(task, delaySeconds) {
    let connection;
    try {
      connection = await this.connect();
      const channel = await connection.createChannel();

      const { exchange, queue, routingKey } = config.rabbitmq;

      await channel.assertExchange(exchange, "x-delayed-message", {
        durable: true,
        arguments: { "x-delayed-type": "direct" },
      });

      await channel.assertQueue(queue, { durable: true });
      await channel.bindQueue(queue, exchange, routingKey);

      channel.publish(exchange, routingKey, Buffer.from(JSON.stringify(task)), {
        headers: { "x-delay": delaySeconds * 1000 },
        persistent: true,
      });

      console.log(
        `✓ Task dijadwalkan: type=${task.type}, delay=${delaySeconds}s`
      );

      setTimeout(() => {
        try { connection.close(); } catch (_) {}
      }, 500);
      return true;
    } catch (error) {
      console.error("✗ Error sendDelayedTask:", error.message);
      if (connection) {
        try { connection.close(); } catch (_) {}
      }
      return false;
    }
  }

  static async _reconnectConsumer() {
    if (this._reconnecting) return;
    this._reconnecting = true;

    while (this._reconnectAttempts < this._maxReconnectAttempts) {
      this._reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this._reconnectAttempts), 30000);
      console.log(
        `🔄 Reconnect consumer attempt ${this._reconnectAttempts}/${this._maxReconnectAttempts} in ${delay / 1000}s...`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));

      try {
        await this.setupConsumer(this._consumerHandler);
        this._reconnectAttempts = 0;
        this._reconnecting = false;
        console.log("✓ Consumer berhasil reconnect ke RabbitMQ");
        return;
      } catch (error) {
        console.error(`✗ Reconnect attempt ${this._reconnectAttempts} gagal:`, error.message);
      }
    }

    this._reconnecting = false;
    console.error(
      `✗ Gagal reconnect setelah ${this._maxReconnectAttempts} percobaan. Consumer tidak aktif.`
    );
  }

  static async setupConsumer(messageHandler) {
    this._consumerHandler = messageHandler;

    try {
      const connection = await this.connect();
      const channel = await connection.createChannel();

      // Handle connection errors & close — trigger reconnect
      connection.on("error", (err) => {
        console.error("⚠️ RabbitMQ connection error:", err.message);
      });
      connection.on("close", () => {
        console.warn("⚠️ RabbitMQ connection closed. Akan mencoba reconnect...");
        this._reconnectConsumer();
      });

      // Handle channel errors
      channel.on("error", (err) => {
        console.error("⚠️ RabbitMQ channel error:", err.message);
      });
      channel.on("close", () => {
        console.warn("⚠️ RabbitMQ channel closed.");
      });

      const { exchange, queue, routingKey } = config.rabbitmq;

      await channel.assertExchange(exchange, "x-delayed-message", {
        durable: true,
        arguments: { "x-delayed-type": "direct" },
      });

      await channel.assertQueue(queue, { durable: true });
      await channel.bindQueue(queue, exchange, routingKey);

      // Only process 1 message at a time to prevent overload
      await channel.prefetch(1);

      console.log("✓ RabbitMQ consumer berhasil dijalankan");

      await channel.consume(queue, async (msg) => {
        if (msg !== null) {
          try {
            const task = JSON.parse(msg.content.toString());
            console.log("Processing task:", task.type);
            await messageHandler(task);
            channel.ack(msg);
          } catch (error) {
            console.error("Error processing message:", error.message);
            // Nack without requeue to avoid infinite loops on bad messages
            try { channel.nack(msg, false, false); } catch (_) {}
          }
        }
      });

      return { connection, channel };
    } catch (error) {
      console.error("✗ Consumer RabbitMQ gagal:", error.message);
      throw error;
    }
  }
}
