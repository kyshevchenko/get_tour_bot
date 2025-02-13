import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import input from "input";
import {
  isMessageInSubscriptions,
  sendIntervalReport,
  sendMessages,
  setRecipients,
  updateSubscribers,
} from "./utils.js";

import dotenv from "dotenv";
dotenv.config();

const apiId = Number(process.env.API_TELEGRAM_ID);
const apiHash = process.env.API_TELEGRAM_HASH;
const stringSession = new StringSession(process.env.SESSION_ID);
const client = new TelegramClient(stringSession, apiId, apiHash, {
  connectionRetries: 5,
});

const serviceChat = process.env.SERVICE_CHAT_ID;
const messageStorage = new Set(); // хралище сообщений для избежания дублей
let subs = {}; // хранилище подписок
let workDays = 0;

const interceptor = async (bot) => {
  await client.start({
    phoneNumber: async () => await input.text("Введите ваш номер телефона: "),
    password: async () =>
      await input.text("Введите ваш пароль (если используется): "),
    phoneCode: async () => await input.text("Введите код из Telegram: "),
    onError: (err) => console.log(err),
  });

  console.log("Авторизация прошла успешно!");
  // console.log("Сессия:");
  // console.log(client.session.save());

  await updateSubscribers(subs); // раз в час обновляем текущие подписки // TODO increase time

  await client.sendMessage(serviceChat, {
    message: "Интерсептор начал работать!",
  });

  sendIntervalReport(bot, client, serviceChat, workDays, 86400000);

  setInterval(() => {
    messageStorage.clear();
  }, 86400000);

  client.addEventHandler(async (update) => {
    if (!update?.message) return;
    try {
      const message = update?.message;
      const channelId = message.peerId?.channelId?.value;
      const messageFromChannel = message.message;
      const messageId = message.id;
      const isRelevantMessage =
        messageId &&
        channelId &&
        !messageStorage.has(messageId) &&
        isMessageInSubscriptions(messageFromChannel, subs);

      if (isRelevantMessage) {
        messageStorage.add(messageId);
        const recipients = setRecipients(subs, messageFromChannel);

        console.log("recipients -->", recipients);
        console.log("messageFromChannel -->", messageFromChannel);

        await sendMessages(
          bot,
          client,
          recipients,
          message,
          serviceChat,
          messageFromChannel
        );
      }
    } catch (error) {
      console.error("Error forwarding message:", error);
    }
  });
};

export default interceptor;
