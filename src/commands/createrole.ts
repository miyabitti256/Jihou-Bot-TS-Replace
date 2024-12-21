import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import {
  type ChatInputCommandInteraction,
  SlashCommandBuilder,
  type ColorResolvable,
} from "discord.js";

const ROLE_CREATION_COST = 5000;

export const data = new SlashCommandBuilder()
  .setName("createrole")
  .setDescription(`新しいロールを作成します（作成料：${ROLE_CREATION_COST}円）`)
  .addStringOption((option) =>
    option
      .setName("name")
      .setDescription("ロールの名前を入力してください")
      .setRequired(true),
  )
  .addStringOption((option) =>
    option
      .setName("color")
      .setDescription("ロールの色を16進数で入力してください（例：#FF0000）")
      .setRequired(true),
  );

export const execute = async (interaction: ChatInputCommandInteraction) => {
  try {
    const name = interaction.options.getString("name");
    const color = interaction.options.getString("color");

    if (!name || !color) {
      await interaction.reply({
        content: "名前と色を指定してください",
        ephemeral: true,
      });
      return;
    }

    // 色の形式を確認
    const colorRegex = /^#[0-9A-Fa-f]{6}$/;
    if (!colorRegex.test(color)) {
      await interaction.reply({
        content: "色は16進数形式で入力してください（例：#FF0000）",
        ephemeral: true,
      });
      return;
    }

    // ユーザーの所持金を確認
    const user = await prisma.user.findUnique({
      where: {
        id: interaction.user.id,
      },
    });

    if (!user) {
      await interaction.reply({
        content: "ユーザーデータが見つかりません",
        ephemeral: true,
      });
      return;
    }

    if (user.money < ROLE_CREATION_COST) {
      await interaction.reply({
        content: `所持金が足りません。ロール作成には${ROLE_CREATION_COST}円必要です。現在の所持金：${user.money}円`,
        ephemeral: true,
      });
      return;
    }

    // ロールを作成
    const newRole = await interaction.guild?.roles.create({
      name: name,
      color: color as ColorResolvable,
      reason: `Created by ${interaction.user.tag}`,
    });

    if (!newRole) {
      await interaction.reply({
        content: "ロールの作成に失敗しました",
        ephemeral: true,
      });
      return;
    }

    // DBにロール情報を保存
    await prisma.role.create({
      data: {
        id: newRole.id,
        name: name,
        color: color,
        position: newRole.position,
        guildId: interaction.guildId as string,
      },
    });

    // 所持金を減らす
    await prisma.user.update({
      where: {
        id: interaction.user.id,
      },
      data: {
        money: user.money - ROLE_CREATION_COST,
      },
    });

    await interaction.reply({
      content: `ロール「${name}」を作成しました。作成料${ROLE_CREATION_COST}円を支払いました。残高：${
        user.money - ROLE_CREATION_COST
      }円`,
      ephemeral: true,
    });
  } catch (error) {
    logger.error(error);
    await interaction.reply({
      content: "ロールの作成に失敗しました",
      ephemeral: true,
    });
  }
};
