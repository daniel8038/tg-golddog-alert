import { Bot } from "grammy";
import { TG_API_TOKEN } from "./tgConfig";

export const bot = new Bot(TG_API_TOKEN);

const setupBot = async () => {
    // 处理 /start 命令
    bot.command("start", async (ctx) => {
        const chatId = ctx.chat.id;
        const threadId = ctx.message.message_thread_id;

        let message = `✅ Bot 启动成功！\n\n`;
        message += `🆔 Chat ID: <code>${chatId}</code>\n`;

        if (threadId) {
            message += `🧵 Thread ID: <code>${threadId}</code>\n`;
        }

        await ctx.reply(message, {
            parse_mode: "HTML",
            message_thread_id: threadId
        });

        console.log(`Chat ID: ${chatId}${threadId ? `, Thread ID: ${threadId}` : ''}`);
    });

    await bot.start({
        onStart: () => {
            console.log("Bot started successfully");
        },
    });
};
setupBot()
export { setupBot };