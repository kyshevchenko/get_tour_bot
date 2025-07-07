import { TelegramClient } from "telegram";
// import { Api } from "telegram/tl/api.js";
import { StringSession } from "telegram/sessions/index.js";
import input from "input";
import {
  checkInterseptorStatus,
  isMessageInSubscriptions,
  isPrivateChannel,
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
  privateData: {},
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

  // временные функции для решения проблемы необнаружения update от старых каналов
  // async function checkChannelAccess(channelEntity) {
  //   try {
  //     const messages = await client.getMessages(channelEntity, { limit: 1 });
  //     return messages.length > 0;
  //   } catch (error) {
  //     console.error(`Ошибка проверки доступа к каналу:`, error.toString());
  //     return false;
  //   }
  // }

  // async function checkChannelsUpdates() {
  //   try {
  //     const dialogs = await client.getDialogs();
  //     console.log(`Найдено ${dialogs.length} диалогов`);

  //     for (const dialog of dialogs) {
  //       if (!dialog.isChannel) continue;

  //       try {
  //         // Получаем полную информацию о канале
  //         const fullChat = await client.invoke(
  //           new Api.channels.GetFullChannel({
  //             channel: dialog.entity,
  //           })
  //         );

  //         // Проверяем доступ к сообщениям
  //         const canViewMessages = await checkChannelAccess(
  //           client,
  //           dialog.title
  //         );

  //         console.log(`Канал "${dialog.title}":`, {
  //           id: dialog.entity.id,
  //           доступ: fullChat.fullChat.canViewParticipants,
  //           can_view_messages: canViewMessages,
  //           pts: fullChat.fullChat.pts,
  //           участников: fullChat.fullChat.participants_count,
  //           последнее_сообщение:
  //             fullChat.fullChat.last_message?.id || "нет данных",
  //         });

  //         // Если нет доступа, пробуем переподписаться
  //         if (!canViewMessages) {
  //           await client.invoke(
  //             new Api.channels.JoinChannel({
  //               channel: dialog.entity,
  //             })
  //           );
  //           console.log(`Переподписались на канал ${dialog.title}`);
  //         }
  //       } catch (error) {
  //         console.error(
  //           `Ошибка при проверке канала ${dialog.title}:`,
  //           error.toString()
  //         );
  //       }
  //     }
  //   } catch (error) {
  //     console.error("Ошибка в checkChannelsUpdates:", error);
  //   }
  // }

  // // Дополнительная подписка на обновления каналов (в тч старых)
  // await client.connect();
  // // Дополнительная проверка и подписка на каналы
  // await checkChannelsUpdates();

  console.log("Авторизация прошла успешно!");
  // console.log("Сессия:");
  // console.log(client.session.save()); // TODO use for copying session to env

  await client.sendMessage(serviceChat, {
    message: "Интерсептор начал работать!",
  });

  await updateSubscribers(state);
  sendIntervalReport(bot, client, serviceChat, state, 86400000);

  client.addEventHandler(async (update) => {
    // Фильтруем только сообщения из чатов и каналов (не из комментов)
    if (
      !["UpdateNewMessage", "UpdateNewChannelMessage"].includes(
        update.className
      ) ||
      !update?.message
    ) {
      return;
    }

    try {
      const message = update?.message;
      const channelId = message.peerId?.channelId?.value;
      const chatId = update?.chatId?.value;
      const {
        id: messageId,
        message: messageFromChannel,
        post: isPost,
      } = message;

      const isRelevantMessage =
        messageId &&
        channelId &&
        !state.messageStorage.has(messageId) &&
        isMessageInSubscriptions(messageFromChannel, state.subs) &&
        isPost; // добавляем проверку на пост, а не сообщение (для каналов)

      checkInterseptorStatus(client, messageFromChannel, serviceChat);

      // Блок для личного интерсептора (для отдельных чатов или каналов)
      const senderId = channelId || chatId;
      const isPrivate = isPrivateChannel(senderId, state.privateData);
      const text =
        typeof messageFromChannel === "string"
          ? messageFromChannel
          : message || "";

      if (isPrivate && text && !state.messageStorage.has(messageId)) {
        const { keywords, recipients, description } =
          state.privateData[senderId];

        const isKeyword = keywords.some(
          (word) => text && text.toLowerCase().includes(word)
        );

        if (!isKeyword) return;

        state.messageStorage.add(messageId);
        return await sendMessages(
          bot,
          client,
          recipients,
          message,
          serviceChat,
          state,
          description // Для указания имени/описания чата в сообщении
        );
      }
      // Блок для личного интерсептора (для отдельных чатов или каналов)

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
