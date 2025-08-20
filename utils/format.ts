import { TokenData } from "../types";
export function wait(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 格式化数值为易读格式
 * @param value - 要格式化的数值（可以是字符串或数字）
 * @param prefix - 前缀符号，如 '$'
 * @param decimals - 保留的小数位数，默认为2
 * @returns 格式化后的字符串
 */
function formatValue(value: string | number, prefix: string = '', decimals: number = 2): string {
    const num = typeof value === 'string' ? parseFloat(value) : value;

    if (isNaN(num) || num === 0) {
        return `${prefix}0`;
    }

    const abs = Math.abs(num);
    const sign = num < 0 ? '-' : '';

    if (abs >= 1e9) {
        // 十亿以上 - B
        return `${sign}${prefix}${(abs / 1e9).toFixed(decimals)}B`;
    } else if (abs >= 1e6) {
        // 百万以上 - M
        return `${sign}${prefix}${(abs / 1e6).toFixed(decimals)}M`;
    } else if (abs >= 1e3) {
        // 千以上 - K
        return `${sign}${prefix}${(abs / 1e3).toFixed(decimals)}K`;
    } else {
        // 小于1000的直接显示
        return `${sign}${prefix}${abs.toFixed(decimals)}`;
    }
}

/**
 * 专门用于格式化市值的函数
 * @param marketCap - 市值（字符串或数字）
 * @returns 格式化后的市值字符串
 */
function formatMarketCap(marketCap: string | number): string {
    return formatValue(marketCap, '$', 2);
}

/**
 * 格式化交易量（通常保留1位小数）
 * @param volume - 交易量
 * @returns 格式化后的交易量字符串
 */
function formatVolume(volume: string | number): string {
    return formatValue(volume, '$', 1);
}

/**
 * 格式化百分比
 * @param percentage - 百分比值（0-1之间的小数）
 * @param decimals - 保留小数位数，默认2位
 * @returns 格式化后的百分比字符串
 */
function formatPercentage(percentage: number, decimals: number = 2): string {
    return `${(percentage * 100).toFixed(decimals)}%`;
}
/**
 * 生成代币发现消息
 * @param tokenItem - 代币数据
 * @returns 格式化的消息字符串
 */
function generateTokenMessage(tokenItem: TokenData): string {
    // const ageInMinutes = ((Date.now() / 1000 - tokenItem.ct) / 60).toFixed(1);
    // const createdTime = new Date(tokenItem.ct * 1000).toLocaleString();

    const message = `
🎯 发现符合条件的代币!
📝 名称: ${tokenItem.s} (${tokenItem.nm})
🏷️ 地址: ${tokenItem.a}
💰 市值: ${formatMarketCap(tokenItem.mc)}
👥 持有人数: ${tokenItem.hd}
⚠️ 捆绑比例: ${(tokenItem.bdrr * 100).toFixed(2)}%
⚠️ 狙击比例: ${(tokenItem.t70_shr * 100).toFixed(2)}%
⚠️ 老鼠比例: ${(tokenItem.rat * 100).toFixed(2)}%
⚠️ 钓鱼比例: ${(tokenItem.etpr * 100).toFixed(2)}%
`;
    // ⏰ 代币年龄: ${ageInMinutes} 分钟
    // 📈 前10大户占比: ${ (tokenItem.t10 * 100).toFixed(2) }%

    // 📊 1h交易量: ${ formatVolume(tokenItem.v1h || '0') }
    // 💧 流动性: ${ tokenItem.lq } SOL
    // 🕐 创建时间: ${ createdTime }
    return message;
}

function getPercentageInterval(percentage: number): number {
    if (percentage < 100) return 0; // 小于100%不通知

    // 100-1000%: 每100%一个区间 (100-200, 200-300, ..., 900-1000)
    if (percentage < 1000) {
        return Math.floor(percentage / 100) * 100;
    }

    // 1000%以上: 每100%一个区间 (1000-1100, 1100-1200, ...)
    return Math.floor(percentage / 100) * 100;
}
// 导出函数
export { formatValue, formatMarketCap, formatVolume, formatPercentage, generateTokenMessage, getPercentageInterval };