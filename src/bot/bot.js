import pkg from "telegraf";
const { Telegraf, session } = pkg;
import stage from "./scenes.js";
import { getSubsListAndBotKeyboard } from "../utils.js";

import dotenv from "dotenv";
dotenv.config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const serviceChat = process.env.SERVICE_CHAT_ID;

bot.use(session());
bot.use(stage);

const startBot = async () => {
  bot.telegram.sendMessage(serviceChat, "Бот начал работать!");
  const subsAndKeyboard = await getSubsListAndBotKeyboard();

  bot.start((ctx) => {
    ctx.scene.leave();
    ctx.scene.enter("subs-scene", subsAndKeyboard);
  });

  bot.on("text", async (ctx) => {
    const userMessage = ctx.message.text;
    if (userMessage !== "Отмена" || userMessage !== "Назад") return;
    try {
      const messageId = ctx.message.message_id;
      await ctx.deleteMessage(messageId);
    } catch (error) {
      console.error("Ошибка при удалении сообщения:", error);
    }
  });

  bot.launch();
  return bot;
};

export default startBot;
