import pkg from "telegraf";
import dotenv from "dotenv";

import { getRequest, postRequest, deleteRequest } from "./src/api/config.js";

dotenv.config();

const { Telegraf, Markup, session, Scenes } = pkg;
const { Stage, WizardScene } = Scenes;

const bot = new Telegraf(process.env.BOT_TOKEN);
const serviceChat = process.env.SERVICE_CHAT_ID; // TODO Использовать для отладки и уведомлений

// bot.telegram.sendMessage(serviceChat, "Бот начал работать!");

const getSubsListFromRequest = async () => {
  // TODO вынести в utils
  const subscriptionsFromRequest = await getRequest(
    "http://localhost:4000/subscriptions/all"
  );
  const { subs, subIds } = subscriptionsFromRequest;

  // Функция для разбивки массива по 5 штук
  function chunkArray(array, chunkSize) {
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  // Разбиваем массив на строки по 5 элементов, оставляем последний ряд отдельно
  const keyboard = chunkArray(
    subs.slice(0, subs.length - (subs.length % 5 || 5)),
    5
  );

  const lastRow = subs.slice(-1 * (subs.length % 5 || 5));

  if (lastRow.length) keyboard.push(lastRow);
  keyboard.push(["Отмена"]);

  return [keyboard, subs, subIds];
};

// Шаг 1 - для выбора подписки из готового списка
const oneStepChooseSubscription = async (ctx) => {
  //   console.log("Первый шаг ------>");
  //   console.log("tx.message.text ------> ", ctx.message.text);

  const [keyboard, subs, subIds] = await getSubsListFromRequest();

  ctx.wizard.state.subsNames = subs;
  ctx.wizard.state.subsIds = subIds;

  const reply = await ctx.reply("Выберите подписку:", {
    reply_markup: {
      keyboard,
      resize_keyboard: true,
      one_time_keyboard: true,
    },
  });

  if (ctx.message.text === "Назад") return;

  return ctx.wizard.next();
};

// Шаг 2 - для подтверждения или удаления подписки
const twoStepChooseOptions = async (ctx) => {
  //   console.log("Второй шаг ------>");
  //   console.log("tx.message.text ------> ", ctx.message.text);

  if (ctx.message.text === "Отмена") {
    ctx.wizard.state = {};
    return ctx.scene.leave();
  }

  if (ctx.wizard.state.subsNames.includes(ctx.message.text)) {
    ctx.wizard.state.choosenSub = ctx.message.text; // Сохраняем выбранную подписку

    const reply = await ctx.reply("Выберите действие:", {
      // TODO вынести в константы
      reply_markup: {
        keyboard: [
          ["Подписаться", "Отменить текущую подписку"],
          ["Назад", "Отмена"],
        ],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    });
  } else {
    return;
  }

  return ctx.wizard.next();
};

// Шаг 3 - для подтверждения или удаления подписки
const threeStepFinish = async (ctx) => {
  // console.log("Третий шаг ------>");
  // console.log("tx.message.text ------> ", ctx.message.text);
  // console.log("ctx.message --->", ctx.message);
  const { id, first_name, last_name, username } = ctx.message.from;
  const chatId = ctx.message.chat.id;
  const telegramId = id;
  const name =
    first_name || last_name ? `${first_name || ""} ${last_name || ""}` : "";
  const telegramTag = username ?? "";
  const subName = ctx.wizard.state.choosenSub;
  const subscriptionId = ctx.wizard.state.subsIds[subName];

  if (ctx.message.text === "Отмена") {
    ctx.wizard.state = {};
    return ctx.scene.leave();
  }

  if (ctx.message.text === "Назад") {
    await ctx.wizard.selectStep(1);
    return oneStepChooseSubscription(ctx);
  }

  if (ctx.message.text === "Подписаться") {
    const createSubResult = await postRequest(
      "http://localhost:4000/chat-subscriptions/new",
      {
        telegramTag,
        telegramId,
        name,
        chatId,
        subName,
        subscriptionId,
      }
    );

    const message = createSubResult.message || createSubResult.error;
    ctx.reply(message);
  }

  if (ctx.message.text === "Отменить текущую подписку") {
    const deleteSub = await deleteRequest(
      `http://localhost:4000/chat-subscriptions/delete`,
      {
        telegramId,
        subscriptionId,
      }
    );

    const message = deleteSub.message || deleteSub.error; // TODO вынести функцией в константы
    ctx.reply(message);
  }

  return ctx.scene.leave();
};

const subsScene = new WizardScene(
  "subs-scene",
  oneStepChooseSubscription,
  twoStepChooseOptions,
  threeStepFinish
);

const stage = new Stage([subsScene]);

bot.use(session());
bot.use(stage);

// Команда для старта бота
bot.start((ctx) => {
  // cancelAndSetDefaultButton(ctx);
  ctx.session = {}; // Очищаем состояние сессии
  ctx.scene.enter("subs-scene");
});

// Команда для вывода списка актвных подписок
bot.command("list", async (ctx) => {
  const telegramId = ctx.from.id;
  const activeSubs = await getRequest(
    `http://localhost:4000/chat-subscriptions/my/${telegramId}`
  );

  const message = activeSubs.message || activeSubs.error;
  ctx.reply(message);
});

// Запуск 1 сцены
//   bot.hears("Подать аварийную заявку", (ctx) => {
//     ctx.session = {}; // Очищаем состояние сессии
//     ctx.scene.enter("accident-scene");
//   });

bot.launch();
