import { Api } from "telegram";
import { deleteRequest, getRequest } from "./api/config.js";
import {
  repeateSendingText,
  secondSendCompletedText,
  secondSendErrorText,
  sendErrorText,
} from "./constants.js";
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

export const updateSubscribers = async (state) => {
  await getSubscribers(state.subs);

  setInterval(async () => {
    for (const key in state.subs) {
      delete state.subs[key];
    }
    await getSubscribers(state.subs);

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
    const subscribers = new Set();

    try {
      for (const key in state.subs) {
        state.subs[key].chats.forEach((e) => subscribers.add(e));
      }

      state.workDays += 1;

      const workDaysMsg = `Дней беспрерывной работы: ${state.workDays}.`;
      const botMsg = `${workDaysMsg}\nКоличество подписчиков: ${subscribers.size}.`;
      const interceptorMsg = `Отловлено сообщений сегодня: ${state.messageStorage.size}.`;

      bot.telegram.sendMessage(id, botMsg);
      client.sendMessage(id, { message: interceptorMsg });

      state.messageStorage.clear();
    } catch (error) {
      console.error("error: ", error);
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

  const photo = message.media?.photo;
  const video = message.media?.video;
  const gif = message.media?.animation;
  const hasMedia = Boolean(photo || video || gif);

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
  } catch (error) {
    console.log("Произошла ошибка при загрузке фото: ", error);
  }

  /** Логирование скорости отправки **/
  const speedArray = [];

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

      // await new Promise((resolve) =>
      //   setTimeout(resolve, deelayBeetweenMessages)
      // );

      /** Логирование скорости отправки **/
      const sec = new Date().getSeconds();
      speedArray.push(sec);
      /** Логирование скорости отправки **/
    } catch (error) {
      const { response } = error;

      // слишком частая работа с апи телеги
      if (response && response.error_code === 429) {
        const waitTime = error.response.parameters.retry_after * 1100;
        client.sendMessage(serviceChat, {
          message: `429 ${sendErrorText}${user}.\n${error}.\nКанал: ${channelName}\nСообщение: ${messageFromChannel.slice(
            0,
            50
          )}...${repeateSendingText} через: ${waitTime} мс`,
        });

        console.log(`Лимит Telegram превышен! Ждём ${waitTime} мс...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        try {
          await bot.telegram.sendMessage(user, caption);

          client.sendMessage(serviceChat, {
            message: `${secondSendCompletedText}${user}.`,
          });
        } catch (error) {
          client.sendMessage(serviceChat, {
            message: `${secondSendErrorText}${user}.\n${error}`,
          });

          console.error(`${secondSendErrorText}${user}`, error);
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
        // другие ошибки, в т. ч. ошибки сети: EADDRNOTAVAIL, ETIMEDOUT, EHOSTUNREACH, EPIPE, socket hang up, network timeout at
      } else {
        await client.sendMessage(serviceChat, {
          message: `${sendErrorText}${user}.\n${error}.\nКанал: ${channelName}\nСообщение: ${messageFromChannel.slice(
            0,
            50
          )}...${repeateSendingText}`,
        });

        console.error(`${sendErrorText}${user}`, error);
        try {
          await bot.telegram.sendMessage(user, caption);

          client.sendMessage(serviceChat, {
            message: `${secondSendCompletedText}${user}.`,
          });
          console.log(`${secondSendCompletedText}${user}.`);
        } catch (error) {
          client.sendMessage(serviceChat, {
            message: `${secondSendErrorText}${user}.\n${error}`,
          });

          console.error(`${secondSendErrorText}${user}`, error);
        }
      }
    }
  }

  /** Логирование скорости отправки **/
  function calculateAverageSpeed(speedArray) {
    if (speedArray.length < 2) return speedArray.length; // Если мало данных — просто возвращаем их количество

    let totalSeconds = 0;

    for (let i = 1; i < speedArray.length; i++) {
      if (speedArray[i] >= speedArray[i - 1]) {
        // Обычное увеличение времени (например, 8 → 9 → 12)
        totalSeconds += speedArray[i] - speedArray[i - 1];
      } else {
        // Переход через границу минуты (например, 59 → 2)
        totalSeconds += 60 - speedArray[i - 1] + speedArray[i];
      }
    }

    const totalMessages = speedArray.length;
    return totalSeconds > 0
      ? (totalMessages / totalSeconds).toFixed(0)
      : totalMessages;
  }
  const averageSpeed = calculateAverageSpeed(speedArray);
  const StatisticMsg = `Получатели: ${recipients.length}.
  Скорость: ${averageSpeed} сообщений/сек.
Сообщение: ${caption.slice(0, 40)}`;

  client.sendMessage(serviceChat, { message: StatisticMsg });
};

export const setRecipients = (messageFromChannel, state) => {
  let recipients = new Set();

  for (const key in state.subs) {
    const keywords = state.subs[key].keywords;
    if (hasKeyword(keywords, messageFromChannel)) {
      state.subs[key].chats.forEach(
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
