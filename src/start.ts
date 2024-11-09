import { spawn } from "node:child_process";
import { join, resolve } from "node:path";
import { logger } from "@lib/logger";

const PM2_PATH = resolve(process.cwd(), "node_modules/.bin/pm2.cmd");
const botScript = join(import.meta.dir, "index.ts");

async function startBot() {
  try {
    // PM2の設定
    const config = {
      name: "jihou-bot",
      script: "bun",
      args: ["run", botScript],
      watch: ["src"],
      ignore_watch: [
        "node_modules",
        "prisma",
        ".git",
        "*.log"
      ],
      max_memory_restart: "1G",
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    };

    // 設定ファイルを一時的に作成
    const configPath = resolve(process.cwd(), "ecosystem.config.js");
    await Bun.write(
      configPath,
      `module.exports = { apps: [${JSON.stringify(config, null, 2)}] }`
    );

    logger.info("🚀 Botを起動しています...");

    // 既存のプロセスを削除（もし存在すれば）
    await new Promise((resolve) => {
      const deleteProcess = spawn(PM2_PATH, ["delete", "jihou-bot"], {
        stdio: "inherit",
        shell: true
      });
      deleteProcess.on("exit", resolve);
    });

    // PM2でBotを起動
    const pm2Process = spawn(PM2_PATH, ["start", configPath], {
      stdio: "inherit",
      shell: true
    });

    pm2Process.on("exit", async (code) => {
      if (code !== 0) {
        logger.error("❌ 起動に失敗しました");
        process.exit(code);
      }

      // 現在の状態を保存
      await new Promise((resolve) => {
        const saveProcess = spawn(PM2_PATH, ["save"], {
          stdio: "inherit",
          shell: true
        });
        saveProcess.on("exit", resolve);
      });

      // Windows用の自動起動設定
      await new Promise((resolve) => {
        const startupProcess = spawn(PM2_PATH, ["startup", "windows"], {
          stdio: "inherit",
          shell: true
        });
        startupProcess.on("exit", resolve);
      });

      logger.info("✅ Botが正常に起動しました");
      logger.info("✅ Windows起動時の自動起動が設定されました");
      logger.info("\n📝 使用可能なコマンド:");
      logger.info("   ログを確認: pm2 logs jihou-bot");
      logger.info("   Bot を停止: pm2 stop jihou-bot");
      logger.info("   Bot を再起動: pm2 restart jihou-bot");
      logger.info("   状態を確認: pm2 status jihou-bot");
    });

  } catch (error) {
    logger.error("予期せぬエラーが発生しました:", error);
    process.exit(1);
  }
}

startBot();
