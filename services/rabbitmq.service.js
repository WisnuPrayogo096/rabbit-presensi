// services/rabbitmq.service.js
import amqp from "amqplib";
import { config } from "../config.js";

export class RabbitMQService {
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
    try {
      const connection = await this.connect();
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
      });

      console.log(
        `✓ Task dijadwalkan: type=${task.type}, delay=${delaySeconds}s`
      );

      setTimeout(() => connection.close(), 500);
      return true;
    } catch (error) {
      console.error("✗ Error sendDelayedTask:", error.message);
      return false;
    }
  }

  static async setupConsumer(messageHandler) {
    try {
      const connection = await this.connect();
      const channel = await connection.createChannel();

      const { exchange, queue, routingKey } = config.rabbitmq;

      await channel.assertExchange(exchange, "x-delayed-message", {
        durable: true,
        arguments: { "x-delayed-type": "direct" },
      });

      await channel.assertQueue(queue, { durable: true });
      await channel.bindQueue(queue, exchange, routingKey);

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
            channel.nack(msg, false, false);
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
