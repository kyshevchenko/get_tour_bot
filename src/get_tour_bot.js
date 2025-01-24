import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import input from "input";

import dotenv from "dotenv";
dotenv.config();

const apiId = Number(process.env.API_TELEGRAM_ID);
const apiHash = process.env.API_TELEGRAM_HASH;
// const forwardChatId = process.env.FORWARD_CHAT_ID;

const stringSession = new StringSession(process.env.SESSION_ID);
const client = new TelegramClient(stringSession, apiId, apiHash, {
  connectionRetries: 5,
});

let messageStorage = []; // хранилище сообщений, которые уже были в чате
let dayCounter = 0; // счетчик дней работы боты

const keywords = [
  "новый год",
  "нового года",
  "новогодний",
  "новогодние",
  "новогодних",
  "новым годом",
  "захватом нового",
  "захватом НГ",
];

// условие для подтверждения о содержании в сообщении необходимых слов
const isKeyword = (message) => {
  return keywords.some((e) => message.toLowerCase().includes(e));
};

const daysDeclension = (number) => {
  if (number > 10 && [11, 12, 13, 14].includes(number % 100)) return "дней";
  const lastNum = number % 10;
  if (lastNum === 1) return "день";
  if ([2, 3, 4].includes(lastNum)) return "дня";
  if ([5, 6, 7, 8, 9, 0].includes(lastNum)) return "дней";
};

async function startBot() {
  await client.start({
    phoneNumber: async () => await input.text("Введите ваш номер телефона: "),
    password: async () =>
      await input.text("Введите ваш пароль (если используется): "),
    phoneCode: async () => await input.text("Введите код из Telegram: "),
    onError: (err) => console.log(err),
  });
  console.log("Авторизация прошла успешно!");

  console.log("Сессия:");
  console.log(client.session.save());

  client.addEventHandler(async (update) => {
    if (update?.message) {
      const channelId = update?.message?.peerId?.channelId?.value;
      const shortMessage = update?.message?.message?.substr(0, 25); // Обрезаем сообщение, чтобы не хранить его целиком
      const fullMessage = update?.message?.message;
      const messageId = update?.message?.id;

      if (
        messageId &&
        channelId &&
        shortMessage &&
        !messageStorage.includes(shortMessage) && // проверяем shortMessage, чтобы не отправлять дубли в чат
        isKeyword(fullMessage) // проверям справочник ключевых слов
      ) {
        messageStorage.push(shortMessage);

        try {
          // Пересылаем сообщение целиком в другой чат
          await client.forwardMessages(forwardChatId, {
            messages: [messageId],
            fromPeer: update.message.peerId,
          });

          await client.sendMessage("me", {
            message: `Cообщение перехвачено и отправлено в чат.`,
          });
        } catch (error) {
          console.error(`Error: ${error.message}`);
        }
      }
    }
  });

  await client.sendMessage("me", { message: "Бот запущен! " });

  // ежедневное сообщение-подтверждение работоспособности бота
  setInterval(async () => {
    dayCounter += 1;

    await client.sendMessage("me", {
      message: `Бот работает штатно: ${dayCounter} ${daysDeclension(
        dayCounter
      )}. 
        Хранилище: ${messageStorage.length} сообщений.`,
    });
  }, 86400000); // раз в сутки
}

startBot();
