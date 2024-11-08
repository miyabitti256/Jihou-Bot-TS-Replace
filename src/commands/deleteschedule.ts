import { removeMessage } from "@/lib/cron";
import { prisma } from "@/lib/prisma";
import {
  type ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("deleteschedule")
  .setDescription("時報を削除します")
  .addStringOption((option) =>
    option
      .setName("id")
      .setDescription("削除する時報のIDを指定します")
      .setRequired(true),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const id = interaction.options.getString("id") as string;

  const message = await prisma.scheduledMessage.findUnique({
    where: {
      id,
    },
  });

  if (!message) {
    await interaction.reply({
      content: "指定されたIDの時報は存在しません",
      ephemeral: true,
    });
    return;
  }
  
  if (message.guildId !== interaction.guild?.id) {
    await interaction.reply({
      content: "指定されたIDの時報は存在しません",
      ephemeral: true,
    });
    return;
  }

  try {
    await removeMessage(id);
  } catch (error) {
    await interaction.reply({
      content: "時報の削除に失敗しました",
      ephemeral: true,
    });
    return;
  }

  await interaction.reply({
    content: "時報を削除しました",
    ephemeral: true,
  });
}
