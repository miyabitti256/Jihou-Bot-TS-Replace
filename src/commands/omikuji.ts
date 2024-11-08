import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import {
  type ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";

const OMIKUJI_TYPES = {
  NUBEKICHI: "ぬべ吉",
  DAIKICHI: "大吉",
  KICHI: "吉",
  CHUKICHI: "中吉",
  SHOKICHI: "小吉",
  SUEKICHI: "末吉",
  KYO: "凶",
  DAIKYO: "大凶",
  BAD_NUBEKICHI: "ヌベキチ└(՞ةڼ◔)」",
} as const;

const OMIKUJI_RESULTS = [
  { result: OMIKUJI_TYPES.NUBEKICHI, probability: 1, money: 20000 },
  { result: OMIKUJI_TYPES.DAIKICHI, probability: 8, money: 1000 },
  { result: OMIKUJI_TYPES.KICHI, probability: 12, money: 500 },
  { result: OMIKUJI_TYPES.CHUKICHI, probability: 16, money: 300 },
  { result: OMIKUJI_TYPES.SHOKICHI, probability: 22, money: 200 },
  { result: OMIKUJI_TYPES.SUEKICHI, probability: 22, money: 100 },
  { result: OMIKUJI_TYPES.KYO, probability: 12, money: -50 },
  { result: OMIKUJI_TYPES.DAIKYO, probability: 5, money: -100 },
  { result: OMIKUJI_TYPES.BAD_NUBEKICHI, probability: 2, money: -300 },
] as const;

type OmikujiResult = (typeof OMIKUJI_RESULTS)[number]["result"];

export const data = new SlashCommandBuilder()
  .setName("omikuji")
  .setDescription("おみくじを引きます");

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  try {
    const user = await getOrCreateUser(interaction);
    const now = getTokyoDate();

    if (hasDrawnToday(now, user.lastDrawDate)) {
      await interaction.editReply("おみくじは一日に一度しか引けません。");
      return;
    }

    const result = drawOmikuji();
    const updatedMoney = Math.max(0, user.money + result.money);

    await updateUserAndCreateResult(
      interaction.user.id,
      updatedMoney,
      now,
      result.result,
    );

    const reply = await buildReply(interaction, result.result);

    setTimeout(() => interaction.editReply(reply), 3000);
  } catch (error) {
    logger.error(`[omikuji] Error executing command: ${error}`);
    await interaction.editReply("おみくじの処理中にエラーが発生しました。");
  }
}

async function getOrCreateUser(interaction: ChatInputCommandInteraction) {
  const user = await prisma.user.findUnique({
    where: { id: interaction.user.id },
  });

  if (user) return user;

  return prisma.user.create({
    data: {
      id: interaction.user.id,
      name: interaction.user.username,
      money: 100,
      lastDrawDate: new Date(0),
    },
  });
}

async function updateUserAndCreateResult(
  userId: string,
  money: number,
  date: Date,
  result: OmikujiResult,
) {
  await Promise.all([
    prisma.user.update({
      where: { id: userId },
      data: { money, lastDrawDate: date },
    }),
    prisma.omikujiResult.create({
      data: { userId, result },
    }),
  ]);
}

async function assignRole(
  interaction: ChatInputCommandInteraction,
  roleName: string,
): Promise<string> {
  const guild = interaction.guild;
  if (!guild) return "\n※ ギルド情報の取得に失敗しました。";

  const role = guild.roles.cache.find((role) => role.name === roleName);
  if (!role) return "\n※ ロールが見つかりません。";

  try {
    const member = await guild.members.fetch(interaction.user.id);
    if (!member.roles.cache.has(role.id)) {
      await member.roles.add(role);
      logger.info(
        `[omikuji] ${interaction.user.username} has been assigned the role ${role.name}`,
      );
    }
    return "";
  } catch (error) {
    logger.error(`[omikuji] Failed to assign role: ${error}`);
    return "\n※ ロールの付与に失敗しました。";
  }
}

function drawOmikuji(): { result: OmikujiResult; money: number } {
  const totalProbability = OMIKUJI_RESULTS.reduce(
    (acc, result) => acc + result.probability,
    0,
  );
  let random = Math.floor(Math.random() * totalProbability);
  for (const result of OMIKUJI_RESULTS) {
    if (random < result.probability) {
      return { result: result.result, money: result.money };
    }
    random -= result.probability;
  }

  return { result: OMIKUJI_TYPES.SUEKICHI, money: 100 };
}

function getTokyoDate(): Date {
  return new Date(
    new Date().toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" }),
  );
}

function hasDrawnToday(now: Date, lastDrawDate: Date): boolean {
  return (
    now.getFullYear() === lastDrawDate.getFullYear() &&
    now.getMonth() === lastDrawDate.getMonth() &&
    now.getDate() === lastDrawDate.getDate()
  );
}

async function buildReply(
  interaction: ChatInputCommandInteraction,
  result: OmikujiResult,
): Promise<string> {
  let reply = `おみくじの結果は${result}です。`;

  if (
    result === OMIKUJI_TYPES.NUBEKICHI ||
    result === OMIKUJI_TYPES.BAD_NUBEKICHI
  ) {
    reply += await assignRole(interaction, result);
  }

  return reply;
}
