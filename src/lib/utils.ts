import cuid from "cuid";
import { client } from "./discordClient";
import { ActivityType } from "discord.js";

export function generateId() {
  return cuid();
}

export function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function updateStatus(startTime: Date) {
  const now = new Date();
  const h = Math.floor((now.getTime() - startTime.getTime()) / 1000 / 60 / 60);
  const status = `${h}時間稼働中`;
  client.user?.setActivity(status, { type: ActivityType.Custom });
}
