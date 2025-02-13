import pkg from "telegraf";
const { Telegraf, session } = pkg;
import stage from "./scenes/sub-scenes.js";
import { deleteRequest, getRequest, postRequest } from "./api/config.js";
import { getSubsListAndBotKeyboard } from "./utils.js";

import dotenv from "dotenv";
dotenv.config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const serviceChat = process.env.SERVICE_CHAT_ID;

bot.use(session());
bot.use(stage);

const startBot = async () => {
  bot.telegram.sendMessage(serviceChat, "Бот начал работать!");

  const subsAndKeyboard = await getSubsListAndBotKeyboard();
  const { subNames, subIds } = subsAndKeyboard;

  bot.start((ctx) => {
    ctx.session = {};
    ctx.session.data = subsAndKeyboard;
    ctx.scene.enter("subs-scene");
  });

  // Команда для вывода списка актвных подписок // TODO вынести в меню команды start
  bot.command("list", async (ctx) => {
    const telegramId = ctx.from.id;
    if (!telegramId) return;

    const activeSubs = await getRequest(
      `http://localhost:4000/chat-subscriptions/my/${telegramId}`
    );

    const message = activeSubs.message || activeSubs.error;
    ctx.reply(message);
  });

  // Команда для помощи
  bot.command("help", async (ctx) => {
    try {
      ctx.reply(
        "Инструкции пока нет.\nВопросы и предложения вы можете отправить по почте gosupmonte@gmail.com."
      );
    } catch (error) {
      console.log(`Ошибка при вызове help: `, error);
      await ctx.telegram.sendMessage(
        serviceChat,
        `Ошибка при обработке четвертой сцены: ${error}`
      );
    }
  });

  // Подписаться на всё // TODO удалить (временное)
  bot.command("subscribeall", async (ctx) => {
    const { id, first_name, last_name, username } = ctx.message.from;
    const chatId = ctx.message.chat.id;
    const name =
      first_name || last_name ? `${first_name || ""} ${last_name || ""}` : "";
    const telegramTag = username ?? "";

    const errors = [];

    for (const subName of subNames) {
      const subscriptionId = subIds[subName];

      const result = await postRequest(
        "http://localhost:4000/chat-subscriptions/new",
        {
          telegramTag,
          telegramId: id,
          name,
          chatId,
          subName,
          subscriptionId,
        }
      );
      if (result.error) errors.push(result.error);
    }

    ctx.reply(
      errors.length ? errors[0] : "Вы успешно подписались сразу на ВСЁ."
    );
  });

  // Отписаться от всего // TODO вынести в отдельную подписку в меню /start
  bot.command("unsubscribeall", async (ctx) => {
    const { id } = ctx.message.from;
    const errors = [];

    for (const subName of subNames) {
      const subscriptionId = subIds[subName];

      const result = await deleteRequest(
        `http://localhost:4000/chat-subscriptions/delete`,
        {
          telegramId: id,
          subscriptionId,
        }
      );
      if (result.error) errors.push(result.error);
    }

    ctx.reply(
      errors.length ? errors[0] : "Вы успешно отписались от всех рассылок."
    );
  });

  bot.launch();
  return bot;
};

export default startBot;
