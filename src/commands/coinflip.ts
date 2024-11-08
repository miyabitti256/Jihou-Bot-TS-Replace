import { logger } from "@/lib/logger";
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
  type ModalSubmitInteraction,
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

const createButtons = (): [ActionRowBuilder<ButtonBuilder>] => {
  const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("input")
      .setLabel("賭け金変更")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("heads")
      .setLabel("表")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("🪙"),
    new ButtonBuilder()
      .setCustomId("tails")
      .setLabel("裏")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("💀"),
  );

  return [buttonRow];
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
    .setMaxLength(5)
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
  choice: "heads" | "tails",
): Promise<GameResult> => {
  const result = Math.random() >= 0.5 ? "heads" : "tails";
  const win = choice === result;
  const resultMoney = win ? state.bet : -state.bet;

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: { money: state.money + resultMoney },
  });

  await prisma.gameLog.create({
    data: {
      userId,
      bet: state.bet,
      win,
      updatedMoney: updatedUser.money,
    },
  });

  return {
    win,
    updatedMoney: updatedUser.money,
  };
};

const handleButtonInteraction = async (
  i: MessageComponentInteraction | ModalSubmitInteraction,
  state: GameState,
  buttons: [ActionRowBuilder<ButtonBuilder>],
): Promise<GameState> => {
  if (i.isModalSubmit() && i.customId === "betInput") {
    try {
      await i.deferUpdate();
      const newBet = Number.parseInt(i.fields.getTextInputValue("betAmount"));
      if (Number.isNaN(newBet) || newBet < 1 || newBet > state.maxBet) {
        await i.followUp({
          content: CONSTANTS.MESSAGES.errors.INVALID_BET(state.maxBet),
          ephemeral: true,
        });
        return state;
      }
      const newState = setBet(state, newBet);
      await i.editReply({
        embeds: [createEmbed(newState)],
        components: buttons,
      });
      return newState;
    } catch (error) {
      logger.error(error);
      await i.followUp({
        content: CONSTANTS.MESSAGES.errors.GENERIC_ERROR,
        ephemeral: true,
      });
      return state;
    }
  }

  return state;
};

const startNewGameSession = async (
  interaction: CommandInteraction,
  initialBet: number,
  userMoney: number,
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
  state: GameState,
  choice: "heads" | "tails",
) => {
  const result = await flipCoin(interaction.user.id, state, choice);
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

    const {
      buttons,
      embed,
      gameState: initialGameState,
    } = await startNewGameSession(interaction, initialBet, userMoney.money);

    await interaction.reply({
      embeds: [embed],
      components: buttons,
    });

    const collector = (
      interaction.channel as TextChannel
    ).createMessageComponentCollector({
      filter: (i) => i.user.id === interaction.user.id,
      idle: CONSTANTS.TIMEOUT_MS,
    });

    let gameState = initialGameState;

    // インタラクションハンドラー内の処理
    collector.on("collect", async (i) => {
      try {
        if (i.isButton()) {
          if (i.customId === "input") {
            const modal = createBetInputModal(gameState);
            await i.showModal(modal);
            const modalSubmit = await i.awaitModalSubmit({
              time: CONSTANTS.TIMEOUT_MS,
              filter: (i) => i.user.id === interaction.user.id,
            });
            gameState = await handleButtonInteraction(
              modalSubmit,
              gameState,
              buttons,
            );
          } else if (i.customId === "playAgain") {
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
              latestUserMoney.money,
            );

            await i.update({
              embeds: [newGame.embed],
              components: newGame.buttons,
            });

            gameState = newGame.gameState;
          } else if (i.customId === "heads" || i.customId === "tails") {
            const { resultButtons, resultEmbed } = await handleGameResult(
              interaction,
              gameState,
              i.customId,
            );

            await i.update({
              embeds: [resultEmbed],
              components: [resultButtons],
            });
          } else if (i.customId === "endGame") {
            const endEmbed = new EmbedBuilder()
              .setTitle("👋 コインフリップを終了します")
              .setDescription("```diff\n+ お疲れ様でした！またね```")
              .setColor("#00ff00")
              .setFooter({
                text: "また遊んでね！",
                iconURL: interaction.user.displayAvatarURL(),
              })
              .setTimestamp();
            await i.update({
              embeds: [endEmbed],
              components: [],
            });
            return;
          } else {
            gameState = await handleButtonInteraction(i, gameState, buttons);
          }
        } else if (i.isModalSubmit()) {
          const modalSubmit = i as ModalSubmitInteraction;
          if (modalSubmit.customId === "betInput") {
            gameState = await handleButtonInteraction(
              modalSubmit,
              gameState,
              buttons,
            );
          }
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
          .setDescription(
            "制限時間が過ぎました。もう一度コマンドを実行してください。",
          )
          .setColor("#ff0000");

        await interaction.editReply({
          embeds: [timeoutEmbed],
          components: [],
        });
      }
    });
  } catch (error) {
    logger.error(error);
    await interaction.reply({
      content: CONSTANTS.MESSAGES.errors.GENERIC_ERROR,
      ephemeral: true,
    });
  }
}
