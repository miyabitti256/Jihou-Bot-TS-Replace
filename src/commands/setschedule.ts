import { addMessage } from "@/lib/cron";
import { logger } from "@/lib/logger";
import { generateId } from "@/lib/utils";
import {
  type ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("setschedule")
  .setDescription("時報する時刻とメッセージを設定します")
  .addStringOption((option) =>
    option
      .setName("time")
      .setDescription("時報する時刻を設定します")
      .setRequired(true),
  )
  .addStringOption((option) =>
    option
      .setName("message")
      .setDescription(
        "時報するメッセージを設定します(未設定の場合はデフォルトのメッセージを使用します)",
      )
      .setRequired(false),
  );

export const execute = async (interaction: ChatInputCommandInteraction) => {
  const time = interaction.options.getString("time");
  const message =
    interaction.options.getString("message") ?? `${time}をお知らせします`;

  if (!time) {
    await interaction.reply({
      content: "時刻を指定してください",
      ephemeral: true,
    });
    return;
  }

  const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
  if (!timeRegex.test(time)) {
    await interaction.reply({
      content: "時刻の形式が正しくありません。 HH:MM の形式で指定してください",
      ephemeral: true,
    });
    return;
  }

  try {
    addMessage({
      id: generateId(),
      guildId: interaction.guildId as string,
      channelId: interaction.channelId as string,
      message,
      scheduleTime: time,
      isActive: true,
      createdUserId: interaction.user.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  } catch (error) {
    logger.error(error);
    await interaction.reply({
      content: "時報の設定に失敗しました",
      ephemeral: true,
    });
    return;
  }

  await interaction.reply({
    content: "時報を設定しました",
    ephemeral: true,
  });
  return;
};
