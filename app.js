import startBot from "./src/bot.js";
import interceptor from "./src/interceptor.js";

const bot = await startBot();

interceptor(bot);
