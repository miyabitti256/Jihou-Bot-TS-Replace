import { prisma } from "@/lib/prisma";
import {
  type CommandInteraction,
  ButtonBuilder,
  ActionRowBuilder,
  ButtonStyle,
  EmbedBuilder,
  SlashCommandBuilder,
  type TextChannel,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type MessageComponentInteraction,
} from "discord.js";

// 型定義
type GameState = {
  readonly bet: number;
  readonly money: number;
  readonly maxBet: number;
};

type GameResult = {
  readonly win: boolean;
  readonly updatedMoney: number;
};

// 定数
const CONSTANTS = {
  TIMEOUT_MS: 60000,
  MAX_BET: 10000,
  MESSAGES: {
    errors: {
      NO_MONEY_DATA:
        "所持金データが見つかりません。`/start`コマンドを実行してください。",
      MIN_BET: "賭け金は1円以上である必要があります。",
      NO_MONEY: "所持金が0円です。他の方法でお金を稼いでください。",
      INVALID_BET: (maxBet: number) =>
        `無効な金額です。1～${maxBet}円の間で指定してください。`,
      GENERIC_ERROR: "エラーが発生しました。もう一度お試しください。",
    },
  },
} as const;

// コマンド定義
export const data = new SlashCommandBuilder()
  .setName("coinflip")
  .setDescription("コインフリップゲームを行います。")
  .addIntegerOption((option) =>
    option.setName("bet").setDescription("賭け金").setRequired(true),
  );

// 純粋関数群
const createGameState = (bet: number, money: number): GameState => ({
  bet: Math.min(bet, Math.min(money, CONSTANTS.MAX_BET)),
  money,
  maxBet: Math.min(money, CONSTANTS.MAX_BET),
});

const adjustBet = (state: GameState, amount: number): GameState => ({
  ...state,
  bet: Math.max(1, Math.min(state.maxBet, state.bet + amount)),
});

const setBet = (state: GameState, newBet: number): GameState => ({
  ...state,
  bet: Math.max(1, Math.min(state.maxBet, newBet)),
});

const createEmbed = (state: GameState): EmbedBuilder =>
  new EmbedBuilder()
    .setTitle("🎲 コインフリップ 🎲")
    .setDescription(
      `現在の賭け金: ${state.bet}円\n` +
        `所持金: ${state.money}円\n` +
        `最大賭け金: ${state.maxBet}円`,
    )
    .setColor("#0099ff");

const createButtons = (): [
  ActionRowBuilder<ButtonBuilder>,
  ActionRowBuilder<ButtonBuilder>,
] => {
  const buttonRow1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("minus100")
      .setLabel("-100")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("minus10")
      .setLabel("-10")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("input")
      .setLabel("直接入力")
      .setStyle(ButtonStyle.Secondary),
  );

  const buttonRow2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("plus10")
      .setLabel("+10")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("plus100")
      .setLabel("+100")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("flip")
      .setLabel("コインを投げる！")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("🎲"),
  );

  return [buttonRow1, buttonRow2];
};

const createResultButtons = (): ActionRowBuilder<ButtonBuilder> =>
  new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("playAgain")
      .setLabel("もう一度プレイ")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("🎲"),
    new ButtonBuilder()
      .setCustomId("endGame")
      .setLabel("終了")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("⏹️"),
  );

const createResultEmbed = (
  state: GameState,
  result: GameResult,
): EmbedBuilder =>
  new EmbedBuilder()
    .setTitle("🎲 コインフリップ結果 🎲")
    .setColor(result.win ? "#00ff00" : "#ff0000")
    .addFields(
      { name: "賭け金", value: `${state.bet}円`, inline: true },
      { name: "結果", value: result.win ? "表 🪙" : "裏 💀", inline: true },
      {
        name: "獲得コイン",
        value: result.win ? `${state.bet}円` : "0円",
        inline: true,
      },
      { name: "現在の所持金", value: `${result.updatedMoney}円`, inline: true },
    );

const createBetInputModal = (state: GameState): ModalBuilder => {
  const betInput = new TextInputBuilder()
    .setCustomId("betAmount")
    .setLabel(`賭け金（1～${state.maxBet}円）`)
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMinLength(1)
    .setMaxLength(10)
    .setValue(state.bet.toString());

  const actionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
    betInput,
  );

  return new ModalBuilder()
    .setCustomId("betInput")
    .setTitle("賭け金を入力")
    .addComponents(actionRow);
};

// 副作用を含む関数群
const flipCoin = async (
  userId: string,
  state: GameState,
): Promise<GameResult> => {
  const win = Math.random() >= 0.5;
  const resultMoney = win ? state.bet : -state.bet;

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: { money: state.money + resultMoney },
  });

  return {
    win,
    updatedMoney: updatedUser.money,
  };
};

const handleButtonInteraction = async (
  i: MessageComponentInteraction,
  state: GameState,
  buttons: [ActionRowBuilder<ButtonBuilder>, ActionRowBuilder<ButtonBuilder>],
): Promise<GameState> => {
  if (!i.isButton()) return state;

  const amount =
    {
      minus100: -100,
      minus10: -10,
      plus10: 10,
      plus100: 100,
    }[i.customId] ?? 0;

  if (amount !== 0) {
    const newState = adjustBet(state, amount);
    await i.update({
      embeds: [createEmbed(newState)],
      components: buttons,
    });
    return newState;
  }

  return state;
};

const startNewGameSession = async (
  interaction: CommandInteraction,
  initialBet: number,
  userMoney: number
) => {
  const maxBet = Math.min(userMoney, CONSTANTS.MAX_BET);
  const currentBet = Math.min(initialBet, maxBet);
  
  const gameState = createGameState(currentBet, userMoney);
  const buttons = createButtons();
  const embed = createEmbed(gameState);

  return { buttons, embed, gameState };
};

const handleGameResult = async (
  interaction: CommandInteraction,
  state: GameState
) => {
  const result = await flipCoin(interaction.user.id, state);
  const resultButtons = createResultButtons();
  const resultEmbed = createResultEmbed(state, result);

  return { resultButtons, resultEmbed, result };
};

// メインの実行関数
export async function execute(interaction: CommandInteraction): Promise<void> {
  try {
    const userMoney = await prisma.user.findUnique({
      where: { id: interaction.user.id },
      select: { money: true },
    });

    if (!userMoney) {
      await interaction.reply({
        content: CONSTANTS.MESSAGES.errors.NO_MONEY_DATA,
        ephemeral: true,
      });
      return;
    }

    const initialBet = interaction.options.get("bet")?.value as number;
    if (initialBet < 1) {
      await interaction.reply({
        content: CONSTANTS.MESSAGES.errors.MIN_BET,
        ephemeral: true,
      });
      return;
    }

    const { buttons, embed, gameState: initialGameState } = await startNewGameSession(
      interaction,
      initialBet,
      userMoney.money
    );

    await interaction.reply({
      embeds: [embed],
      components: buttons,
    });

    const collector = (interaction.channel as TextChannel).createMessageComponentCollector({
      filter: (i) => i.user.id === interaction.user.id,
      time: CONSTANTS.TIMEOUT_MS,
    });

    let gameState = initialGameState;

    collector.on("collect", async (i) => {
      try {
        if (i.customId === "playAgain") {
          const latestUserMoney = await prisma.user.findUnique({
            where: { id: interaction.user.id },
            select: { money: true },
          });

          if (!latestUserMoney) {
            await i.reply({
              content: CONSTANTS.MESSAGES.errors.NO_MONEY_DATA,
              ephemeral: true,
            });
            return;
          }

          const newGame = await startNewGameSession(
            interaction,
            gameState.bet,
            latestUserMoney.money
          );

          await i.update({
            embeds: [newGame.embed],
            components: newGame.buttons,
          });

          collector.stop();
          execute(interaction);
        } else if (i.customId === "flip") {
          const { resultButtons, resultEmbed } = await handleGameResult(
            interaction,
            gameState
          );

          await i.update({
            embeds: [resultEmbed],
            components: [resultButtons],
          });

          collector.stop();
        } else {
          gameState = await handleButtonInteraction(i, gameState, buttons);
        }
      } catch (error) {
        console.error(error);
        if (!i.replied && !i.deferred) {
          await i.reply({
            content: CONSTANTS.MESSAGES.errors.GENERIC_ERROR,
            ephemeral: true,
          });
        }
      }
    });

    collector.on("end", async (collected, reason) => {
      if (reason === "time") {
        const timeoutEmbed = new EmbedBuilder()
          .setTitle("⏰ タイムアウト")
          .setDescription("制限時間が過ぎました。もう一度コマンドを実行してください。")
          .setColor("#ff0000");

        await interaction.editReply({
          embeds: [timeoutEmbed],
          components: [],
        });
      }
    });
  } catch (error) {
    console.error(error);
    await interaction.reply({
      content: CONSTANTS.MESSAGES.errors.GENERIC_ERROR,
      ephemeral: true,
    });
  }
}