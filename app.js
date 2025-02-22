import startBot from "./src/bot/bot.js";
import interceptor from "./src/interceptor/interceptor.js";

const bot = await startBot();

interceptor(bot);
