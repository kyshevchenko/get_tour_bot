import pkg from "telegraf";
const { Telegraf, session } = pkg;
import stage from "./scenes.js";
import { getSubsListAndBotKeyboard } from "../utils.js";
import { somethingWentWrongMsg } from "../constants.js";

import dotenv from "dotenv";
dotenv.config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const serviceChat = process.env.SERVICE_CHAT_ID;

bot.use(session());
bot.use(stage);

const startBot = async () => {
  bot.telegram.sendMessage(serviceChat, "Бот начал работать!");
  const subsAndKeyboard = await getSubsListAndBotKeyboard();

  bot.start(async (ctx) => {
    try {
      await ctx.scene.leave();
      await ctx.scene.enter("subs-scene", subsAndKeyboard);
    } catch (error) {
      console.error("Ошибка при обработке команды /start:", error);
      ctx.reply(somethingWentWrongMsg);
    }
  });

  bot.on("text", async (ctx) => {
    const userMessage = ctx.message.text;
    if (userMessage !== "Отмена" || userMessage !== "Назад") return;
    try {
      const messageId = ctx.message.message_id;
      await ctx.deleteMessage(messageId);
    } catch (error) {
      console.error("Ошибка при удалении сообщения в bot.on('text'):", error);
    }
  });

  bot.launch();
  return bot;
};

export default startBot;
