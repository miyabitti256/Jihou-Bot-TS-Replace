import { Collection } from "discord.js";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { Command } from "@/types/command";

export const commands = new Collection<string, Command>();

export async function loadCommands() {
  const commandsPath = join("./src/commands");
  const commandFiles = readdirSync(commandsPath).filter(
    (file) => file.endsWith(".ts") || file.endsWith(".js"),
  );

  for (const file of commandFiles) {
    const filePath = join(commandsPath, file);
    try {
      const command = await import(filePath);

      if (!command?.data || !command?.execute) {
        console.warn(`[警告] ${file} は正しい形式でコマンドをエクスポートしていません`);
        continue;
      }

      commands.set(command.data.name, command);
      console.log(`[成功] ${file} を読み込みました`);
    } catch (error) {
      console.error(`[エラー] ${file} の読み込み中にエラーが発生しました:`, error);
    }
  }
}
