import pino from "pino";
import path from "node:path";

// ロガーの作成
export const logger = pino({
  level: "info",

  // 複数のターゲットに出力するための設定
  transport: {
    targets: [
      // コンソールへの出力設定
      {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
        },
        level: "info"
      },
      // ファイルへの出力設定
      {
        target: "pino/file",
        options: {
          destination: path.join(process.cwd(), "logs", "app.log"),
          mkdir: true
        },
        level: "info"
      }
    ]
  },

  // ログに含める基本情報
  base: {
    env: process.env.NODE_ENV,
    pid: process.pid,
  },
});