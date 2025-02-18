import { Api } from "telegram";
import { deleteRequest, getRequest } from "./api/config.js";
import path from "path";
import fs from "fs";

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const defaultPhoto = fs.readFileSync(__dirname + "/images/defaultPhoto.png");

const getSubscribers = async (subs) => {
  try {
    const { subscriptions, message, error } = await getRequest(
      "http://localhost:4000/chat-subscriptions/all"
    );

    for (const i in subscriptions) {
      subs[i] = subscriptions[i];
    }
  } catch (error) {
    console.error("error: ", error);
  }
};

export const updateSubscribers = async (subs, state) => {
  await getSubscribers(subs);

  setInterval(async () => {
    await getSubscribers(subs);
    state.blockedUsers.clear();
  }, 3600000); // Раз в час
};

const hasKeyword = (keywords, messageFromChannel) =>
  keywords
    .split(", ")
    .some((e) => messageFromChannel.toLowerCase().includes(e));

export const isMessageInSubscriptions = (message, subs) => {
  if (!message) return;

  let keys = [];
  for (const key in subs) {
    keys.push(...subs[key].keywords.split(", "));
  }
  return keys.some((e) => message.toLowerCase().includes(e));
};

// Функция для разбивки массива по chunkSize штук
function chunkArray(array, chunkSize) {
  array.slice(0, array.length - (array.length % 3 || 3));

  const chunks = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

export const getSubsListAndBotKeyboard = async () => {
  const subData = await getRequest("http://localhost:4000/subscriptions/all");
  const groupNames = Object.keys(subData);
  const mainKeyboard = chunkArray(groupNames, 3);
  mainKeyboard.push(["Настройки бота", "Отмена"]);

  const subIds = {};
  Object.values(subData).forEach((elems) => {
    for (const e in elems) {
      subIds[e] = elems[e].id;
    }
  });

  const subsKeyboards = {};
  const subNames = [];

  for (const key in subData) {
    const subs = Object.keys(subData[key]);
    subNames.push(...subs);

    if (!subsKeyboards[key]) subsKeyboards[key] = {};

    const chunkedKeyboard = chunkArray(subs, 5);
    chunkedKeyboard.push(["Назад", "Отмена"]);
    subsKeyboards[key] = chunkedKeyboard;
  }

  return { mainKeyboard, subsKeyboards, groupNames, subNames, subIds };
};

export const sendIntervalReport = async (bot, client, id, state, interval) => {
  setInterval(() => {
    try {
      state.workDays += 1;
      const message = `Дней беспрерывной работы: ${state.workDays}`;

      bot.telegram.sendMessage(id, message);
      client.sendMessage(id, { message });

      state.messageStorage.clear();
    } catch (error) {
      console.log("error: ", error);
    }
  }, interval);
};

// // Рассылка сообщения интерсептором
export const sendMessages = async (
  bot,
  client,
  recipients,
  message,
  serviceChat,
  state
) => {
  // const deelayBeetweenMessages = 30;
  const deelayBeetweenMessages = 1;

  const photo = message.media?.photo;
  const video = message.media?.video;
  const gif = message.media?.animation;
  const hasMedia = Boolean(photo || video || gif);
  console.log("Медиа присутствует:", hasMedia);

  const messageFromChannel = message.message;
  const channelEntity = await client.getEntity(message.peerId);
  const channelName = channelEntity.username
    ? `@${channelEntity.username}`
    : channelEntity.title;

  const draftCaption = `${channelName}: ${messageFromChannel}`;
  const caption =
    draftCaption.length > 1000
      ? `${draftCaption.slice(0, 997)}...`
      : draftCaption;

  let buffer = defaultPhoto;
  try {
    if (photo) {
      buffer = await client.downloadFile(
        new Api.InputPhotoFileLocation({
          id: photo.id,
          accessHash: photo.accessHash,
          fileReference: photo.fileReference,
          thumbSize: "w",
        }),
        {}
      );
    }

    console.log("Фото было загружено --->", buffer.length, "байт");
  } catch (error) {
    console.log("Произошла ошибка при загрузке фото: ", error);
  }

  for (const user of recipients) {
    try {
      hasMedia
        ? await bot.telegram.sendPhoto(
            user,
            {
              source: buffer,
            },
            { caption }
          )
        : await bot.telegram.sendMessage(user, caption);

      await new Promise((resolve) =>
        setTimeout(resolve, deelayBeetweenMessages)
      );
      const sec = new Date().getSeconds();
      console.log(`Отправлено: ${user} ->`, sec);
    } catch (error) {
      const { response } = error;

      // слишком частая работа с апи телеги
      if (response && response.error_code === 429) {
        const waitTime = error.response.parameters.retry_after * 1100;
        client.sendMessage(serviceChat, {
          message: `Ошибка 429 при отправке пользователю ${user}.\n${error}.\nКанал: ${channelName}\nСообщение: ${messageFromChannel.slice(
            0,
            50
          )}...\nЖдем перед повтором: ${waitTime}`,
        });
        console.log(`Лимит Telegram превышен! Ждём ${waitTime} мс...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        try {
          client.sendMessage(serviceChat, {
            message: `Осуществляется повторная отправка сообщения пользователю: ${user}.`,
          });
          await bot.telegram.sendMessage(user, caption);
        } catch (error) {
          client.sendMessage(serviceChat, {
            message: `Ошибка при повторной отправке сообщения пользователю: ${user}.\n${error}`,
          });
          console.error(`Ошибка при повторной отправке ${user}:`, error);
        } // ошибка при заблокированном боте
      } else if (
        response &&
        (response.error_code === 403 || response.error_code === 404)
      ) {
        state.blockedUsers.add(user);
        await deleteRequest(
          `http://localhost:4000/chat-subscriptions/deleteall`,
          {
            telegramId: user,
          }
        );
        // другие ошибки
      } else {
        console.error(`Ошибка при отправке пользователю ${user}:`, error);
        await client.sendMessage(serviceChat, {
          message: `Ошибка при отправке пользователю ${user}.\n${error}.\nКанал: ${channelName}\nСообщение: ${messageFromChannel.slice(
            0,
            50
          )}...`,
        });
      }
    }
  }
};

export const setRecipients = (subs, messageFromChannel, state) => {
  let recipients = new Set();

  for (const key in subs) {
    const keywords = subs[key].keywords;
    if (hasKeyword(keywords, messageFromChannel)) {
      subs[key].chats.forEach(
        (chatId) => !state.blockedUsers.has(chatId) && recipients.add(chatId)
      );
    }
  }
  return [...recipients];
};

export const getResponseMessage = (response) =>
  response?.message ||
  response?.error ||
  "В настоящее время сервер не отвечает, попробуйте чуть позже...";

export const checkInterseptorStatus = (client, msg, serviceChat) => {
  if (msg === "Статус")
    client.sendMessage(serviceChat, { message: "Интерсептор работает!" });
};

export const deleteBotPrevMsg = async (ctx, state) => {
  if (!state.prevBotMsg) return;

  for (const msgId of state.prevBotMsg) {
    setTimeout(async () => {
      await ctx.deleteMessage(msgId).catch(() => {});
    }, 10);
  }
  state.prevBotMsg.clear();
};

// export const daysDeclension = (number) => { Пока не используется
//   if (number > 10 && [11, 12, 13, 14].includes(number % 100)) return "дней";
//   const lastNum = number % 10;
//   if (lastNum === 1) return "день";
//   if ([2, 3, 4].includes(lastNum)) return "дня";
//   if ([5, 6, 7, 8, 9, 0].includes(lastNum)) return "дней";
// };

// export const removeMessages = async (ctx, messages) => { Пока не используется
//   if (!messages?.length) return;
//   console.log("messages -->", messages);
//   for (const messageId of messages) {
//     try {
//       console.log("Удаляем сообщение -->", messageId);

//       ctx.deleteMessage(messageId);
//     } catch (error) {
//       console.error("Ошибка при удалении сообщения:", error);
//     }
//   }
// };
