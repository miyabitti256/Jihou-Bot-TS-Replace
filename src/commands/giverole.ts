import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import {
  type ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";

const ROLE_GIVE_COST_SELF = 5000;
const ROLE_GIVE_COST_OTHER = 10000;

export const data = new SlashCommandBuilder()
  .setName("giverole")
  .setDescription(
    `ユーザーにロールを付与します（付与料：自分${ROLE_GIVE_COST_SELF}円、他人${ROLE_GIVE_COST_OTHER}円）`,
  )
  .addUserOption((option) =>
    option
      .setName("user")
      .setDescription("ロールを付与するユーザーを選択してください")
      .setRequired(true),
  )
  .addRoleOption((option) =>
    option
      .setName("role")
      .setDescription("付与するロールを選択してください")
      .setRequired(true),
  );

export const execute = async (interaction: ChatInputCommandInteraction) => {
  try {
    const targetUser = interaction.options.getUser("user");
    const role = interaction.options.getRole("role", true);

    if (!targetUser || !role) {
      await interaction.reply({
        content: "ユーザーとロールを指定してください",
        ephemeral: true,
      });
      return;
    }

    // 支払うユーザーの所持金を確認
    const payingUser = await prisma.user.findUnique({
      where: {
        id: interaction.user.id,
      },
    });

    if (!payingUser) {
      await interaction.reply({
        content: "ユーザーデータが見つかりません",
        ephemeral: true,
      });
      return;
    }

    const isSelf = targetUser.id === interaction.user.id;
    const cost = isSelf ? ROLE_GIVE_COST_SELF : ROLE_GIVE_COST_OTHER;

    if (payingUser.money < cost) {
      await interaction.reply({
        content: `所持金が足りません。ロール付与には${cost}円必要です。現在の所持金：${payingUser.money}円`,
        ephemeral: true,
      });
      return;
    }

    // ロールが既に付与されているか確認
    const existingUserRole = await prisma.userGuildRole.findUnique({
      where: {
        userId_roleId_guildId: {
          userId: targetUser.id,
          roleId: role.id,
          guildId: interaction.guildId as string,
        },
      },
    });

    if (existingUserRole) {
      await interaction.reply({
        content: "指定されたユーザーは既にこのロールを持っています",
        ephemeral: true,
      });
      return;
    }

    // ロールを付与
    const member = await interaction.guild?.members.fetch(targetUser.id);
    if (!member) {
      await interaction.reply({
        content: "メンバー情報の取得に失敗しました",
        ephemeral: true,
      });
      return;
    }

    await member.roles.add(role.id);

    await prisma.userGuildRole.create({
      data: {
        userId: targetUser.id,
        roleId: role.id,
        guildId: interaction.guildId as string,
      },
    });

    await prisma.user.update({
      where: {
        id: interaction.user.id,
      },
      data: {
        money: payingUser.money - cost,
      },
    });

    const targetUserName = isSelf ? "自分" : targetUser.username;

    await interaction.reply({
      content: `${targetUserName}にロール「${role.name}」を付与しました。付与料${cost}円を支払いました。残高：${
        payingUser.money - cost
      }円`,
      ephemeral: true,
    });
  } catch (error) {
    logger.error(error);
    await interaction.reply({
      content: "ロールの付与に失敗しました",
      ephemeral: true,
    });
  }
};
