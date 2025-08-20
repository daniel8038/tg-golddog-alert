import { INC_TG_CHAT_ID, INC_TG_MESSAGE_THREAD_ID, SL_TG_CHAT_ID, SL_TG_MESSAGE_THREAD_ID, S_TG_CHAT_ID, S_TG_MESSAGE_THREAD_ID, TP_TG_CHAT_ID, TP_TG_MESSAGE_THREAD_ID, TRADE_TG_CHAT_ID, TRADE_TG_MESSAGE_THREAD_ID } from "./tgConfig";
import { bot } from "./bot";
type TgChannelType = "Signal" | "Inc" | "Trade" | "StopLoss" | "TakeProfit";
async function sendToTelegram(message: string, type: TgChannelType) {
    let chatId: string, threadId: number;
    switch (type) {
        case "Inc":
            chatId = INC_TG_CHAT_ID;
            threadId = INC_TG_MESSAGE_THREAD_ID;
            break;
        case "Signal":
            chatId = S_TG_CHAT_ID;
            threadId = S_TG_MESSAGE_THREAD_ID;
            break;
        case "Trade":
            chatId = TRADE_TG_CHAT_ID;
            threadId = TRADE_TG_MESSAGE_THREAD_ID;
            break;
        case "StopLoss":
            chatId = SL_TG_CHAT_ID;
            threadId = SL_TG_MESSAGE_THREAD_ID;
            break;
        case "TakeProfit":
            chatId = TP_TG_CHAT_ID;
            threadId = TP_TG_MESSAGE_THREAD_ID;
            break;
        default:
            break;
    }
    try {
        await bot.api.sendMessage(chatId, message, {
            message_thread_id: threadId,
        });
    } catch (error) {
        console.error("发送消息到 Telegram 失败:", error);
    }
}

export { sendToTelegram };