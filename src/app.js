import startBot from "./bot/bot.js";
import interceptor from "./interceptor/interceptor.js";

const bot = await startBot();

interceptor(bot);
