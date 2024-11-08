import { editMessage } from "@/lib/cron";
import { prisma } from "@/lib/prisma";
import {
  ChannelType,
  type ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("editschedule")
  .setDescription("時報を編集します IDはscheduleinfoで確認できます")
  .addStringOption((option) =>
    option
      .setName("id")
      .setDescription("編集する時報のIDを指定します")
      .setRequired(true),
  )
  .addStringOption((option) =>
    option
      .setName("time")
      .setDescription("編集する時報の時刻を指定します")
      .setRequired(false),
  )
  .addStringOption((option) =>
    option
      .setName("message")
      .setDescription("編集する時報のメッセージを指定します")
      .setRequired(false),
  )
  .addStringOption((option) =>
    option
      .setName("channel")
      .setDescription("メッセージを送信するチャンネルを変更します")
      .setRequired(false),
  )
  .addBooleanOption((option) =>
    option
      .setName("isactive")
      .setDescription("時報を有効にするかどうかを指定します")
      .setRequired(false),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const id = interaction.options.getString("id") as string;
  const time = interaction.options.getString("time") as string | null;
  const message = interaction.options.getString("message") as string | null;
  const channelId = interaction.options.getString("channel") as string | null;
  const isActive = interaction.options.getBoolean("isactive") as boolean | null;

  if (time) {
    const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(time)) {
      await interaction.reply({
        content: "時刻の形式が正しくありません",
        ephemeral: true,
      });
      return;
    }
  }
  if (channelId) {
    const channel = await interaction.guild?.channels.fetch(channelId);
    if (!channel || channel.type !== ChannelType.GuildText) {
      await interaction.reply({
        content: "チャンネルが見つかりません",
        ephemeral: true,
      });
      return;
    }
  }

  const messageData = await prisma.scheduledMessage.findUnique({
    where: {
      id,
    },
  });
  if (!messageData) {
    await interaction.reply({
      content: "指定されたIDの時報は見つかりません",
      ephemeral: true,
    });
    return;
  }

  if (messageData.guildId !== interaction.guild?.id) {
    await interaction.reply({
      content: "指定されたIDの時報は見つかりません",
      ephemeral: true,
    });
    return;
  }

  const updateData = {
    ...messageData,
    scheduleTime: time ?? messageData.scheduleTime,
    message: message ?? messageData.message,
    channelId: channelId ?? messageData.channelId,
    isActive: isActive ?? messageData.isActive,
  };

  try {
    await editMessage(updateData);
    await interaction.reply({
      content: "時報を編集しました",
      ephemeral: true,
    });
  } catch (error) {
    await interaction.reply({
      content: "時報の編集に失敗しました",
      ephemeral: true,
    });
  }
}
