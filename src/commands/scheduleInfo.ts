import {
  type ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from "discord.js";
import { prisma } from "@/lib/prisma";
export const data = new SlashCommandBuilder()
  .setName("scheduleinfo")
  .setDescription("時報の情報を表示します");

export async function execute(interaction: ChatInputCommandInteraction) {
  const guildId = interaction.guildId as string;
  const messages = await prisma.scheduledMessage.findMany({
    where: {
      guildId,
    },
  });
  const embed = new EmbedBuilder().setTitle("時報の情報");
  if (messages.length > 0) {
    for (const message of messages) {
      embed.addFields({
        name: `ID: ${message.id} 時刻: ${message.scheduleTime}`,
        value: `内容: ${message.message} アクティブ: ${message.isActive}`,
      });
    }
  } else {
    embed.setDescription("時報は設定されていません");
  }
  await interaction.reply({ embeds: [embed] });
  return;
}
