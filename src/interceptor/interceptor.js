import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import input from "input";
import {
  checkInterseptorStatus,
  isMessageInSubscriptions,
  sendIntervalReport,
  sendMessages,
  setRecipients,
  updateSubscribers,
} from "../utils.js";

import dotenv from "dotenv";
dotenv.config();

const apiId = Number(process.env.API_TELEGRAM_ID);
const apiHash = process.env.API_TELEGRAM_HASH;
const stringSession = new StringSession(process.env.SESSION_ID);
const client = new TelegramClient(stringSession, apiId, apiHash, {
  connectionRetries: 15,
  connectionTimeout: 10000,
});

const serviceChat = process.env.SERVICE_CHAT_ID;
const state = {
  blockedUsers: new Set(),
  messageStorage: new Set(),
  subs: {},
  workDays: 0,
};

const interceptor = async (bot) => {
  await client.start({
    phoneNumber: async () => await input.text("Введите ваш номер телефона: "),
    password: async () =>
      await input.text("Введите ваш пароль (если используется): "),
    phoneCode: async () => await input.text("Введите код из Telegram: "),
    onError: (err) => {
      console.log(err);
      bot.telegram.sendMessage(serviceChat, `Ошибка в интерсепторе: ${err}`);
    },
  });

  console.log("Авторизация прошла успешно!");
  // console.log("Сессия:");
  // console.log(client.session.save());

  await client.sendMessage(serviceChat, {
    message: "Интерсептор начал работать!",
  });

  await updateSubscribers(state); // раз в час обновляем текущие подписки и обнуляем blockedUsers
  sendIntervalReport(bot, client, serviceChat, state, 86400000);

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
        !state.messageStorage.has(messageId) &&
        isMessageInSubscriptions(messageFromChannel, state.subs);

      checkInterseptorStatus(client, messageFromChannel, serviceChat);

      if (!isRelevantMessage) return;

      state.messageStorage.add(messageId);
      const recipients = setRecipients(messageFromChannel, state);

      await sendMessages(bot, client, recipients, message, serviceChat, state);
    } catch (error) {
      console.error("Error forwarding message:", error);
    }
  });
};

export default interceptor;
