import pkg from "telegraf";
const { Scenes } = pkg;
const { Stage, WizardScene } = Scenes;
import { getRequest, postRequest, deleteRequest } from "../api/config.js";
import { deleteBotPrevMsg, getResponseMessage } from "../utils.js";

import dotenv from "dotenv";
dotenv.config();

const serviceChat = process.env.SERVICE_CHAT_ID;

// Шаг 1 - для выбора подписки из готового списка
const oneStepChooseSubgroup = async (ctx) => {
  try {
    const messageText = ctx.message?.text;
    if (!messageText) return;

    ctx.wizard.state.id = ctx.message.from.id;
    ctx.wizard.state.prevBotMsg = new Set();
    const { mainKeyboard } = ctx.wizard.state;
    ctx.wizard.state.prevBotMsg.add(ctx.message.message_id);

    const reply = await ctx.reply("Выберите раздел:", {
      reply_markup: {
        keyboard: mainKeyboard,
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    });
    ctx.wizard.state.prevBotMsg.add(reply.message_id);

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
    await ctx.deleteMessage().catch(() => {});
    deleteBotPrevMsg(ctx, ctx.wizard.state);

    const messageText = ctx.message?.text;
    if (!messageText) return;

    const { groupNames, subsKeyboards } = ctx.wizard.state;

    if (messageText === "Отмена" || messageText === "/start") {
      return await ctx.scene.leave();
    }

    const chooseSubBtns = [
      ["Показать мои подписки"],
      ["Отписаться от всех уведомлений"],
      ["Назад"],
    ];

    if (messageText === "Настройки бота") {
      const reply = await ctx.reply("Выберите подписку:", {
        reply_markup: {
          keyboard: chooseSubBtns,
          resize_keyboard: true,
        },
      });
      ctx.wizard.state.prevBotMsg.add(reply.message_id);

      return ctx.wizard.next();
    }

    if (groupNames.includes(messageText)) {
      const choosenGroup = messageText;

      const reply = await ctx.reply("Выберите направление:", {
        reply_markup: {
          keyboard: subsKeyboards[choosenGroup],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      });
      ctx.wizard.state.prevBotMsg.add(reply.message_id);

      return ctx.wizard.next();
    }

    if (messageText) return;

    return await ctx.scene.leave();
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
    await ctx.deleteMessage().catch(() => {});
    deleteBotPrevMsg(ctx, ctx.wizard.state);

    const messageText = ctx.message?.text;
    const { id } = ctx.wizard.state;
    if (!messageText) return;

    if (messageText === "Отмена" || messageText === "/start") {
      return ctx.scene.leave();
    }

    if (messageText === "Назад") {
      await ctx.wizard.selectStep(1);
      return oneStepChooseSubgroup(ctx);
    }

    if (messageText === "Показать мои подписки") {
      if (!id) return ctx.scene.leave();

      const activeSubsResponse = await getRequest(
        `http://localhost:4000/chat-subscriptions/my/${id}`
      );

      const message = getResponseMessage(activeSubsResponse);
      await ctx.reply(message);
      return ctx.scene.leave();
    }

    if (messageText === "Отписаться от всех уведомлений") {
      if (!id) return ctx.scene.leave();

      const unsubscribeAllResponse = await deleteRequest(
        `http://localhost:4000/chat-subscriptions/deleteall`,
        {
          telegramId: id,
        }
      );

      const message = getResponseMessage(unsubscribeAllResponse);
      await ctx.reply(message);

      return ctx.scene.leave();
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
      ctx.wizard.state.prevBotMsg.add(reply.message_id);

      return ctx.wizard.next();
    }

    if (messageText) return;

    return await ctx.scene.leave();
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
    await ctx.deleteMessage().catch(() => {});
    deleteBotPrevMsg(ctx, ctx.wizard.state);

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

    if (messageText === "Отмена" || messageText === "/start") {
      return ctx.scene.leave();
    }

    if (messageText === "Назад") {
      await ctx.wizard.selectStep(3);
      return threeStepChooseOptions(ctx);
    }

    if (messageText === "Подписаться") {
      const createSubResponse = await postRequest(
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

      const message = getResponseMessage(createSubResponse);
      await ctx.reply(message);
      return ctx.scene.leave();
    }

    if (messageText === "Отменить текущую подписку") {
      const deleteSubResponse = await deleteRequest(
        `http://localhost:4000/chat-subscriptions/delete`,
        {
          telegramId,
          subscriptionId,
        }
      );

      const message = getResponseMessage(deleteSubResponse);
      await ctx.reply(message);
      return ctx.scene.leave();
    }

    if (messageText) return;

    return await ctx.scene.leave();
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
