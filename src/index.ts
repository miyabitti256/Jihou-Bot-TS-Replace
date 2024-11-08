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
  
  const guilds = client.guilds.cache;
  for (const [guildId, guild] of guilds) {
    await prisma.guild.upsert({
      where: { id: guildId },
      update: { name: guild.name },
      create: {
        id: guildId,
        name: guild.name,
      },
    });
  }
  
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
  
  logger.info(`${guilds.size}個のサーバーとデータを同期しました`);
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
