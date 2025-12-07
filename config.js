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
      hostname: process.env.RABBIT_HOST,
      port: parseInt(process.env.RABBIT_PORT) || 5672,
      username: process.env.RABBIT_USER,
      password: process.env.RABBIT_PASS,
      vhost: process.env.RABBIT_VHOST || "/",
      heartbeat: 30,
    },
    fallbackUrl: `amqp://${process.env.RABBIT_USER}:${process.env.RABBIT_PASS}@${process.env.RABBIT_HOST}:${process.env.RABBIT_PORT}`,
    fallbackSimple: `amqp://${process.env.RABBIT_HOST}`,
    exchange: "delayed_exchange",
    queue: "delayed_queue",
    routingKey: "routing_key",
  },
  session: {
    tokenExpiryDays: 32,
    warningBeforeDays: 30, // peringatkan 1 hari sebelum expired
  },
};
