// config.js
import dotenv from "dotenv";
dotenv.config();

export const config = {
  telegram: {
    token: process.env.TELEGRAM_TOKEN,
  },
  api: {
    baseUrl: process.env.BASE_URL,
  },
  rabbitmq: {
    primary: {
      hostname: process.env.RABBIT_HOST || "localhost",
      port: parseInt(process.env.RABBIT_PORT) || 5672,
      username: process.env.RABBIT_USER || "guest",
      password: process.env.RABBIT_PASS || "guest",
      vhost: process.env.RABBIT_VHOST || "/",
      heartbeat: 30,
    },
    fallbackUrl: `amqp://${process.env.RABBIT_USER || "guest"}:${process.env.RABBIT_PASS || "guest"}@${process.env.RABBIT_HOST || "localhost"}:${process.env.RABBIT_PORT || 5672}`,
    fallbackSimple: `amqp://${process.env.RABBIT_HOST || "localhost"}`,
    exchange: "delayed_exchange",
    queue: "delayed_queue",
    routingKey: "routing_key",
  },
};
