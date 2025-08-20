import { TradingConfig } from '../types';
import dotenv from "dotenv"
dotenv.config()
export const CONFIG: TradingConfig = {
    // 交易开关
    TRADE_ENABLED: true,

    // 每次买入使用的SOL数量
    SOL_INVESTMENT_AMOUNT: 0.01,

    // 风险管理
    RISK: {
        MAX_POSITIONS: parseInt(process.env.MAX_POSITIONS || '30')
    },

    // 交易策略
    STRATEGY: {
        // 初始止损百分比（负数）
        INITIAL_STOP_LOSS: parseFloat(process.env.INITIAL_STOP_LOSS || '-65'),

        // 翻倍止盈阈值
        DOUBLE_PROFIT_THRESHOLD: parseFloat(process.env.DOUBLE_PROFIT_THRESHOLD || '100'),

        // 翻倍时卖出比例
        DOUBLE_SELL_RATIO: parseFloat(process.env.DOUBLE_SELL_RATIO || '50'),

        // 目标市值1 (200K)
        TARGET_MC_1: parseFloat(process.env.TARGET_MC_1 || '200000'),
        TARGET_MC_1_RATIO: parseFloat(process.env.TARGET_MC_1_RATIO || '50'),

        // 目标市值2 (900K)
        TARGET_MC_2: parseFloat(process.env.TARGET_MC_2 || '900000'),
        TARGET_MC_2_RATIO: parseFloat(process.env.TARGET_MC_2_RATIO || '100'),

        // LFG触发卖出比例
        LFG_SELL_RATIO: parseFloat(process.env.LFG_SELL_RATIO || '65')
    },
    // 
    SOLANA: {
        WALLET_KEY: process.env.PRIVATE_KEY,
        RPC: "https://delicate-bitter-meadow.solana-mainnet.quiknode.pro/cfcf4b66ee16de962b28fb9cbed2a2cd66ed5329/"
    },
    LOGGER_FILE_PATH: "logs/Dogs"
};

// 打印配置信息（启动时）
export function printConfig(): void {
    console.log('🔧 Trading Configuration:');
    console.log(`   Trade Enabled: ${CONFIG.TRADE_ENABLED ? '✅' : '❌'}`);
    console.log(`   SOL Investment: ${CONFIG.SOL_INVESTMENT_AMOUNT} SOL per position`);
    console.log(`   Max Positions: ${CONFIG.RISK.MAX_POSITIONS}`);
    console.log(`   Stop Loss: ${CONFIG.STRATEGY.INITIAL_STOP_LOSS}%`);
    console.log(`   Double Profit: ${CONFIG.STRATEGY.DOUBLE_PROFIT_THRESHOLD}% (sell ${CONFIG.STRATEGY.DOUBLE_SELL_RATIO}%)`);
    console.log(`   Target MC1: ${CONFIG.STRATEGY.TARGET_MC_1} (sell ${CONFIG.STRATEGY.TARGET_MC_1_RATIO}%)`);
    console.log(`   Target MC2: ${CONFIG.STRATEGY.TARGET_MC_2} (sell ${CONFIG.STRATEGY.TARGET_MC_2_RATIO}%)`);
    console.log(`   LFG Sell: ${CONFIG.STRATEGY.LFG_SELL_RATIO}%`);
}

// 验证配置
export function validateConfig(): boolean {
    const errors: string[] = [];

    if (CONFIG.SOL_INVESTMENT_AMOUNT <= 0) {
        errors.push('SOL_INVESTMENT_AMOUNT must be greater than 0');
    }

    if (CONFIG.RISK.MAX_POSITIONS <= 0) {
        errors.push('MAX_POSITIONS must be greater than 0');
    }

    if (CONFIG.STRATEGY.INITIAL_STOP_LOSS >= 0) {
        errors.push('INITIAL_STOP_LOSS must be negative (e.g., -15)');
    }

    if (CONFIG.STRATEGY.DOUBLE_PROFIT_THRESHOLD <= 0) {
        errors.push('DOUBLE_PROFIT_THRESHOLD must be greater than 0');
    }

    if (CONFIG.STRATEGY.DOUBLE_SELL_RATIO < 0 || CONFIG.STRATEGY.DOUBLE_SELL_RATIO > 100) {
        errors.push('DOUBLE_SELL_RATIO must be between 0 and 100');
    }

    if (CONFIG.STRATEGY.TARGET_MC_1_RATIO < 0 || CONFIG.STRATEGY.TARGET_MC_1_RATIO > 100) {
        errors.push('TARGET_MC_1_RATIO must be between 0 and 100');
    }

    if (CONFIG.STRATEGY.TARGET_MC_2_RATIO < 0 || CONFIG.STRATEGY.TARGET_MC_2_RATIO > 100) {
        errors.push('TARGET_MC_2_RATIO must be between 0 and 100');
    }

    if (CONFIG.STRATEGY.LFG_SELL_RATIO < 0 || CONFIG.STRATEGY.LFG_SELL_RATIO > 100) {
        errors.push('LFG_SELL_RATIO must be between 0 and 100');
    }

    if (errors.length > 0) {
        console.error('❌ Configuration Errors:');
        errors.forEach(error => console.error(`   - ${error}`));
        return false;
    }

    return true;
}