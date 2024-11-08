import type { ScheduledMessage } from "@prisma/client";
import { prisma } from "./prisma";
import { logger } from "./logger";
import cron from "node-cron";
import { client } from "./discordClient";
import { TextChannel } from "discord.js";
import { cronJobs } from "@/index";
const getActiveMessages = async () => {
  return await prisma.scheduledMessage.findMany({
    where: {
      isActive: true,
    },
  });
};

const setCron = async (message: ScheduledMessage) => {
  const existingJob = cronJobs.get(message.id);
  if (existingJob) {
    existingJob.stop();
  }

  const [hours, minutes] = message.scheduleTime.split(":");

  const job = cron.schedule(`${minutes} ${hours} * * *`, () => {
    const channel = client.channels.cache.get(message.channelId);
    if (channel instanceof TextChannel) {
      channel.send(message.message);
      logger.info(`${message.id} のメッセージを送信しました`);
    } else {
      logger.error(`${message.id} のメッセージを送信でエラーが発生しました`);
    }
  });

  cronJobs.set(message.id, job);
};

const stopCron = async (id: string) => {
  const existingJob = cronJobs.get(id);
  if (existingJob) {
    existingJob.stop();
    cronJobs.delete(id);
  }
};

const addMessage = async (params: ScheduledMessage) => {
  try {
    const message = await prisma.scheduledMessage.create({
      data: params,
    });
    await setCron(message);
    logger.info("メッセージを追加しました", params);
  } catch (error) {
    console.error(error);
    logger.error("エラーが発生しました", error);
  }
};

const editMessage = async (params: ScheduledMessage) => {
  try {
    const message = await prisma.scheduledMessage.update({
      where: { id: params.id },
      data: params,
    });
    if (message.isActive) {
      await setCron(message);
    } else {
      await stopCron(message.id);
    }
    logger.info("メッセージを更新しました", params);
  } catch (error) {
    logger.error("エラーが発生しました", error);
  }
};

const removeMessage = async (id: string) => {
  try {
    const existingJob = cronJobs.get(id);
    if (existingJob) {
      existingJob.stop();
      cronJobs.delete(id);
    }
    await prisma.scheduledMessage.delete({
      where: { id },
    });
    logger.info(`${id} のメッセージを削除しました`);
  } catch (error) {
    logger.error(`${id} のメッセージを削除でエラーが発生しました`, error);
  }
};

const init = async () => {
  const messages = await getActiveMessages();
  messages.forEach(setCron);
};

export { init, addMessage, editMessage, removeMessage };
