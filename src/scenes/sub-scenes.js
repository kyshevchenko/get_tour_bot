import pkg from "telegraf";
const { Scenes } = pkg;
const { Stage, WizardScene } = Scenes;
import { postRequest, deleteRequest } from "../api/config.js";

const serviceChat = process.env.SERVICE_CHAT_ID;

// Шаг 1 - для выбора подписки из готового списка
const oneStepChooseSubgroup = async (ctx) => {
  try {
    const messageText = ctx.message?.text;
    if (!messageText) return;

    const { id } = ctx.message.from;
    const { mainKeyboard, subsKeyboards, groupNames, subNames, subIds } =
      ctx.session.data;
    ctx.wizard.state.subIds = subIds;
    ctx.wizard.state.groupNames = groupNames;
    ctx.wizard.state.subNames = subNames;
    ctx.wizard.state.subsKeyboards = subsKeyboards;
    ctx.wizard.state.id = id;

    //   const reply = для удаления сообщений
    await ctx.reply("Выберите подписку:", {
      reply_markup: {
        keyboard: mainKeyboard,
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    });

    if (messageText === "Назад") return;

    return ctx.wizard.next();
  } catch (error) {
    console.log(
      `Ошибка при обработке первой сцены у ${ctx.wizard.state.id}: `,
      error
    );
    await ctx.telegram.sendMessage(
      serviceChat,
      `Ошибка при обработке первой сцены у ${ctx.wizard.state.id}: ${error}`
    );
  }
};

// Шаг 2 - для выбора подписки из готового списка
const twoStepChooseSubscription = async (ctx) => {
  try {
    const messageText = ctx.message?.text;
    if (!messageText) return;

    const { groupNames, subsKeyboards } = ctx.wizard.state;

    if (messageText === "Отмена") {
      return await ctx.scene.leave();
    }

    if (groupNames.includes(messageText)) {
      const choosenGroup = messageText;

      const reply = await ctx.reply("Выберите действие:", {
        // TODO вынести в константы
        reply_markup: {
          keyboard: subsKeyboards[choosenGroup],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      });
      return ctx.wizard.next();
    }

    return;
  } catch (error) {
    console.log(
      `Ошибка при обработке второй сцены у ${ctx.wizard.state.id}: `,
      error
    );
    await ctx.telegram.sendMessage(
      serviceChat,
      `Ошибка при обработке второй сцены у ${ctx.wizard.state.id}: ${error}`
    );
  }
};

// Шаг 3 - для подтверждения или удаления подписки
const threeStepChooseOptions = async (ctx) => {
  try {
    const messageText = ctx.message?.text;
    if (!messageText) return;

    if (messageText === "Отмена") {
      return ctx.scene.leave();
    }

    if (messageText === "Назад") {
      await ctx.wizard.selectStep(1);
      return oneStepChooseSubgroup(ctx);
    }

    if (ctx.wizard.state.subNames.includes(messageText)) {
      ctx.wizard.state.choosenSub = messageText;
      const reply = await ctx.reply("Выберите действие:", {
        reply_markup: {
          keyboard: [
            ["Подписаться", "Отменить текущую подписку"],
            ["Назад", "Отмена"],
          ],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      });
      return ctx.wizard.next();
    }

    return;
  } catch (error) {
    console.log(
      `Ошибка при обработке третьей сцены у ${ctx.wizard.state.id}: `,
      error
    );
    await ctx.telegram.sendMessage(
      serviceChat,
      `Ошибка при обработке третьей сцены у ${ctx.wizard.state.id}: ${error}`
    );
  }
};

// Шаг 4 - для подтверждения или удаления подписки
const fourStepFinish = async (ctx) => {
  try {
    const messageText = ctx.message?.text;
    if (!messageText) return;

    const { id, first_name, last_name, username } = ctx.message.from;
    const chatId = ctx.message.chat.id;
    const telegramId = id;
    const name =
      first_name || last_name ? `${first_name || ""} ${last_name || ""}` : "";
    const telegramTag = username ?? "";
    const subName = ctx.wizard.state.choosenSub;
    const subscriptionId = ctx.wizard.state.subIds[subName];

    if (messageText === "Отмена") {
      ctx.wizard.state = {};
      return ctx.scene.leave();
    }

    if (messageText === "Назад") {
      await ctx.wizard.selectStep(3);
      return threeStepChooseOptions(ctx);
    }

    if (messageText === "Подписаться") {
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
      return ctx.scene.leave();
    }

    if (messageText === "Отменить текущую подписку") {
      const deleteSub = await deleteRequest(
        `http://localhost:4000/chat-subscriptions/delete`,
        {
          telegramId,
          subscriptionId,
        }
      );

      const message = deleteSub.message || deleteSub.error || "";
      ctx.reply(message);
      return ctx.scene.leave();
    }

    return;
  } catch (error) {
    console.log(
      `Ошибка при обработке четвертой сцены у ${ctx.wizard.state.id}: `,
      error
    );
    await ctx.telegram.sendMessage(
      serviceChat,
      `Ошибка при обработке четвертой сцены у ${ctx.wizard.state.id}: ${error}`
    );
  }
};

const subsScene = new WizardScene(
  "subs-scene",
  oneStepChooseSubgroup,
  twoStepChooseSubscription,
  threeStepChooseOptions,
  fourStepFinish
);

const stage = new Stage([subsScene]);

export default stage;
