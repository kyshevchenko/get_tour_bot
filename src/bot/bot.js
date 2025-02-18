import pkg from "telegraf";
const { Telegraf, session } = pkg;
import stage from "./scenes.js";
import { getSubsListAndBotKeyboard } from "../utils.js";
import { postRequest } from "../api/config.js";

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
    ctx.scene.leave();

    ctx.session.data = subsAndKeyboard;
    ctx.scene.enter("subs-scene");
  });

  // Подписаться на всё // TODO для тестирования, удалить
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

  bot.launch();
  return bot;
};

export default startBot;
