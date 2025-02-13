import { Api } from "telegram";
import { getRequest } from "../src/api/config.js";

// export const daysDeclension = (number) => {
//   if (number > 10 && [11, 12, 13, 14].includes(number % 100)) return "дней";
//   const lastNum = number % 10;
//   if (lastNum === 1) return "день";
//   if ([2, 3, 4].includes(lastNum)) return "дня";
//   if ([5, 6, 7, 8, 9, 0].includes(lastNum)) return "дней";
// };

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

export const updateSubscribers = async (subs) => {
  await getSubscribers(subs);

  setInterval(async () => {
    await getSubscribers(subs);
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
  mainKeyboard.push(["Отмена"]);

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

export const sendIntervalReport = async (
  bot,
  client,
  id,
  workDays,
  interval
) => {
  setInterval(() => {
    try {
      workDays += 1;
      const message = `Дней беспрерывной работы: ${workDays}`;

      bot.telegram.sendMessage(id, message);
      client.sendMessage(id, { message });
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
  messageFromChannel
) => {
  const deelayBeetweenMessages = 50;

  const photo = message.media?.photo;
  const hasPhoto = Boolean(photo);
  const channelEntity = await client.getEntity(message.peerId);
  const channelName = channelEntity.username
    ? `@${channelEntity.username}`
    : channelEntity.title;

  const caption = `${channelName}: ${messageFromChannel || ""}`;

  const buffer = hasPhoto
    ? await client.downloadFile(
        new Api.InputPhotoFileLocation({
          id: photo.id,
          accessHash: photo.accessHash,
          fileReference: photo.fileReference,
          thumbSize: "w",
        }),
        {}
      )
    : "";

  for (const user of recipients) {
    try {
      hasPhoto
        ? await bot.telegram.sendPhoto(user, { source: buffer }, { caption })
        : await bot.telegram.sendMessage(user, caption);

      await new Promise((resolve) =>
        setTimeout(resolve, deelayBeetweenMessages)
      );
    } catch (error) {
      if (error.response && error.response.error_code === 429) {
        const waitTime = error.response.parameters.retry_after * 1100;
        console.log(`Лимит Telegram превышен! Ждём ${waitTime} мс...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        await bot.telegram.sendMessage(user, caption); // Повторяем отправку
        // TODO добавить удаления пользователя из БД с подписками при ошибке доступа
      } else {
        console.error(`Ошибка при отправке ${user}:`, error);
        await bot.telegram.sendMessage(
          serviceChat,
          `Ошибка при отправке пользователю ${user}.\n${error}.\nКанал: ${channelName}\nСообщение: ${messageFromChannel.slice(
            0,
            30
          )}...`
        );
      }
    }
  }
};

export const setRecipients = (subs, messageFromChannel) => {
  let recipients = new Set();

  for (const key in subs) {
    const keywords = subs[key].keywords;
    if (hasKeyword(keywords, messageFromChannel)) {
      subs[key].chats.forEach((chatId) => recipients.add(chatId));
    }
  }
  return [...recipients];
};
