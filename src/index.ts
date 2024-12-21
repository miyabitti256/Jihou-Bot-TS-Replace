import { client } from "@lib/discordClient";
import { logger } from "@lib/logger";
import { prisma } from "@lib/prisma";
import { init, removeMessage } from "@lib/cron";
import { updateStatus } from "@lib/utils";
import cron from "node-cron";
import { commands, loadCommands } from "@lib/commandHandler";

const token = process.env.DISCORD_TOKEN as string;

export const cronJobs = new Map<string, cron.ScheduledTask>();
// botが起動したら
client.on("ready", async () => {
  logger.info("Discord client connected");

  try {
    // ギルドの upsert
    await Promise.all(
      client.guilds.cache.map((guild) =>
        prisma.guild.upsert({
          where: { id: guild.id },
          update: { name: guild.name },
          create: {
            id: guild.id,
            name: guild.name,
          },
        }),
      ),
    );

    // ギルドのロールを同期
    for (const [_, guild] of client.guilds.cache) {
      const roles = await guild.roles.fetch();
      const members = await guild.members.fetch();

      const nonEveryoneRoles = Array.from(roles.values()).filter(
        (role) => role.name !== "@everyone",
      );

      await Promise.all(
        nonEveryoneRoles.map((role) =>
          prisma.role.upsert({
            where: { id: role.id },
            update: {
              name: role.name,
              color: role.hexColor,
              position: role.position,
            },
            create: {
              id: role.id,
              name: role.name,
              color: role.hexColor,
              position: role.position,
              guild: {
                connect: { id: guild.id },
              },
            },
          }),
        ),
      );

      const batchSize = 5;
      const memberArray = Array.from(members.values());

      for (let i = 0; i < memberArray.length; i += batchSize) {
        const batch = memberArray.slice(i, i + batchSize);

        await Promise.all(
          batch.map(async (member) => {
            const memberRoles = member.roles.cache.filter(
              (role) => role.name !== "@everyone",
            );

            return Promise.all(
              memberRoles.map((role) =>
                prisma.userGuildRole.upsert({
                  where: {
                    userId_roleId_guildId: {
                      userId: member.id,
                      roleId: role.id,
                      guildId: guild.id,
                    },
                  },
                  create: {
                    userId: member.id,
                    roleId: role.id,
                    guildId: guild.id,
                  },
                  update: {},
                }),
              ),
            );
          }),
        );

        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    // メンバー処理を分割して実行
    for (const [_, guild] of client.guilds.cache) {
      const members = await guild.members.fetch();

      // botを除外したメンバーリストを作成
      const nonBotMembers = Array.from(members.values()).filter(
        (member) => !member.user.bot,
      );

      // バッチ処理
      const batchSize = 5;
      for (let i = 0; i < nonBotMembers.length; i += batchSize) {
        const batch = nonBotMembers.slice(i, i + batchSize);

        await Promise.all(
          batch.map(async (member) => {
            try {
              await prisma.user.upsert({
                where: { id: member.id },
                update: {
                  name: member.displayName,
                  guilds: {
                    upsert: {
                      where: {
                        userId_guildId: {
                          userId: member.id,
                          guildId: guild.id,
                        },
                      },
                      create: {
                        guild: {
                          connect: { id: guild.id },
                        },
                      },
                      update: {},
                    },
                  },
                },
                create: {
                  id: member.id,
                  name: member.displayName,
                  lastDrawDate: new Date(0),
                  guilds: {
                    create: {
                      guild: {
                        connect: { id: guild.id },
                      },
                    },
                  },
                },
              });
            } catch (error) {
              console.error(
                `Error processing user ${member.displayName}:`,
                error,
              );
            }
          }),
        );

        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    logger.info(
      `${client.guilds.cache.size}個のサーバーのユーザーを同期しました`,
    );

    init();
    loadCommands();
    const startTime = new Date();
    updateStatus(startTime);
    cron.schedule(
      `${startTime.getSeconds()} ${startTime.getMinutes()} * * * *`,
      () => {
        updateStatus(startTime);
      },
    );
  } catch (error) {
    logger.error("データベースの同期中にエラーが発生しました:", {
      error,
      stack: error instanceof Error ? error.stack : undefined,
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// サーバーに参加したら
client.on("guildCreate", async (guild) => {
  try {
    await prisma.guild.create({
      data: {
        id: guild.id,
        name: guild.name,
      },
    });
    const guildMembers = await guild.members.fetch();
    await Promise.all(
      guildMembers.map((member) =>
        prisma.user.upsert({
          where: { id: member.id },
          update: { name: member.displayName },
          create: {
            id: member.id,
            name: member.displayName,
          },
        }),
      ),
    );
    logger.info(`${guild.name}に参加しました`);
  } catch (error) {
    logger.error(`${guild.name}への参加中にエラーが発生しました`, error);
  }
  const nubekichiRole = guild.roles.cache.find(
    (role) => role.name === "ぬべ吉",
  );
  const badNubekichiRole = guild.roles.cache.find(
    (role) => role.name === "ヌベキチ└(՞ةڼ◔)」",
  );
  if (!nubekichiRole) {
    await guild.roles.create({
      name: "ぬべ吉",
      color: "#f0ff00",
    });
  }
  if (!badNubekichiRole) {
    await guild.roles.create({
      name: "ヌベキチ└(՞ةڼ◔)」",
      color: "#b32be8",
    });
  }
});

// サーバーから退出したら
client.on("guildDelete", async (guild) => {
  try {
    const scheduledMessages = await prisma.scheduledMessage.findMany({
      where: {
        guildId: guild.id,
      },
    });
    if (scheduledMessages.length > 0) {
      for (const message of scheduledMessages) {
        removeMessage(message.id);
      }
      await prisma.scheduledMessage.deleteMany({
        where: {
          guildId: guild.id,
        },
      });
    }
    await prisma.guild.delete({
      where: {
        id: guild.id,
      },
    });
    logger.info(`${guild.name}から退出しました`);
  } catch (error) {
    logger.error(`${guild.name}からの退出中にエラーが発生しました`, error);
  }
});

client.on("guildMemberAdd", async (member) => {
  try {
    await prisma.user.upsert({
      where: { id: member.id },
      update: {
        name: member.displayName,
        guilds: {
          upsert: {
            where: {
              userId_guildId: {
                userId: member.id,
                guildId: member.guild.id,
              },
            },
            create: {
              guild: {
                connect: { id: member.guild.id },
              },
            },
            update: {},
          },
        },
      },
      create: {
        id: member.id,
        name: member.displayName,
        guilds: {
          create: {
            guild: {
              connect: { id: member.guild.id },
            },
          },
        },
      },
    });
    logger.info(`${member.displayName}が${member.guild.name}に参加しました`);
  } catch (error) {
    logger.error(`${member.displayName}の同期中にエラーが発生しました`, error);
  }
});

client.on("guildMemberRemove", async (member) => {
  try {
    await prisma.userGuild.delete({
      where: {
        userId_guildId: {
          userId: member.id,
          guildId: member.guild.id,
        },
      },
    });

    await prisma.userGuildRole.deleteMany({
      where: {
        userId: member.id,
        guildId: member.guild.id,
      },
    });

    logger.info(`${member.displayName}が${member.guild.name}から退出しました`);
  } catch (error) {
    logger.error(
      `${member.displayName}の退出処理中にエラーが発生しました`,
      error,
    );
  }
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const command = commands.get(interaction.commandName);
  if (!command) return;
  try {
    await command.execute(interaction);
  } catch (error) {
    logger.error(
      `${interaction.commandName}コマンドの実行中にエラーが発生しました`,
      error,
    );
    await interaction.reply({
      content: "コマンドの実行中にエラーが発生しました",
      ephemeral: true,
    });
  }
});

client.login(token);
