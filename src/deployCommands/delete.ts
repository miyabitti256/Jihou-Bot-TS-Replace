import { REST } from "@discordjs/rest";
import { Routes } from "discord-api-types/v10";

const token = process.env.DISCORD_TOKEN as string;
const clientId = process.env.DISCORD_CLIENT_ID as string;

const rest = new REST({ version: "10" }).setToken(token);

(async () => {
  try {
    console.log("Started deleting application (/) commands.");

    await rest.put(Routes.applicationCommands(clientId), { body: [] });

    console.log("Successfully deleted application (/) commands.");
  } catch (error) {
    console.error(error);
  }
})();
