import { OrderType, Position, PositionStatus, TokenData, TriggerType } from '../types';
import { TradingDatabase } from '../database/tradingDb';
import { OrderManager } from './orderManager';
import { CONFIG } from '../config';
import logger from '../services/logger';
import { executeBuy } from './jupiterSwap';

export class PositionManager {
    private db: TradingDatabase;
    private orderManager: OrderManager;

    constructor(db: TradingDatabase, orderManager: OrderManager) {
        this.db = db;
        this.orderManager = orderManager;
    }

    /**
     * 创建新仓位
     */
    async createPosition(token: TokenData, solInvested: number): Promise<Position | null> {
        const address = token.a;
        const symbol = token.s;
        const currentPrice = token.mc;

        // 检查风险限制
        const activeCount = this.db.getPositionCount();
        if (activeCount >= CONFIG.RISK.MAX_POSITIONS) {
            logger.warn(`Risk limit reached (${activeCount}/${CONFIG.RISK.MAX_POSITIONS}), skipping ${symbol}`);
            return null;
        }

        // 检查是否已存在
        const existing = this.db.getPosition(address);
        if (existing) {
            logger.warn(`Position already exists for ${symbol} at ${address}`);
            return null;
        }

        const position: Position = {
            id: address, // 使用address作为ID
            address,
            symbol,
            entryPrice: currentPrice,
            currentPrice: currentPrice,
            highestPrice: currentPrice,
            lowestPrice: currentPrice,
            solInvested,
            entryTime: Date.now(),
            lastUpdated: Date.now(),
            status: PositionStatus.ACTIVE,
            lfg: 0
        };

        try {
            // 保存仓位到数据库
            this.db.insertPosition(position);

            // 创建默认订单
            this.createDefaultOrders(position);
            const buyResult = await executeBuy(position);

            if (!buyResult.success) {
                // 买入失败，删除仓位记录
                this.db.deletePosition(position.id);
                logger.error(`❌ Buy failed for ${symbol}: ${buyResult.error}`);
                return null;
            }
            logger.info(`✅ Position created: ${symbol} @ ${currentPrice} (invested: ${CONFIG.SOL_INVESTMENT_AMOUNT} SOL)`);
            return position;

        } catch (error) {
            logger.error(`Failed to create position for ${symbol}:`, error);
            return null;
        }
    }

    /**
     * 创建默认订单
     */
    private createDefaultOrders(position: Position): void {
        // 止损单
        this.orderManager.createOrder({
            positionId: position.id,
            type: OrderType.STOP_LOSS,
            sellRatio: 100, // 全部卖出
            triggerType: TriggerType.GAIN_PERCENT,
            triggerCondition: 'LTE',
            triggerValue: CONFIG.STRATEGY.INITIAL_STOP_LOSS,
            triggerDescription: `止损 ${CONFIG.STRATEGY.INITIAL_STOP_LOSS}%`,
            description: `Initial stop loss at ${CONFIG.STRATEGY.INITIAL_STOP_LOSS}%`
        });

        // 翻倍止盈单
        if (CONFIG.STRATEGY.DOUBLE_SELL_RATIO > 0 && position.entryPrice < 30000) {
            this.orderManager.createOrder({
                positionId: position.id,
                type: OrderType.TAKE_PROFIT,
                sellRatio: CONFIG.STRATEGY.DOUBLE_SELL_RATIO,
                triggerType: TriggerType.GAIN_PERCENT,
                triggerCondition: 'GTE',
                triggerValue: CONFIG.STRATEGY.DOUBLE_PROFIT_THRESHOLD,
                triggerDescription: `翻倍止盈 ${CONFIG.STRATEGY.DOUBLE_PROFIT_THRESHOLD}%`,
                description: `Double profit at ${CONFIG.STRATEGY.DOUBLE_PROFIT_THRESHOLD}%`
            });
        }

        // 目标市值1
        if (CONFIG.STRATEGY.TARGET_MC_1 > 0) {
            this.orderManager.createOrder({
                positionId: position.id,
                type: OrderType.TAKE_PROFIT,
                sellRatio: CONFIG.STRATEGY.TARGET_MC_1_RATIO,
                triggerType: TriggerType.PRICE,
                triggerCondition: 'GTE',
                triggerValue: CONFIG.STRATEGY.TARGET_MC_1,
                triggerDescription: `目标市值 ${CONFIG.STRATEGY.TARGET_MC_1}`,
                description: `Target MC ${CONFIG.STRATEGY.TARGET_MC_1}`
            });
        }

        // 目标市值2
        if (CONFIG.STRATEGY.TARGET_MC_2 > 0) {
            this.orderManager.createOrder({
                positionId: position.id,
                type: OrderType.TAKE_PROFIT,
                sellRatio: CONFIG.STRATEGY.TARGET_MC_2_RATIO,
                triggerType: TriggerType.PRICE,
                triggerCondition: 'GTE',
                triggerValue: CONFIG.STRATEGY.TARGET_MC_2,
                triggerDescription: `目标市值 ${CONFIG.STRATEGY.TARGET_MC_2}`,
                description: `Target MC ${CONFIG.STRATEGY.TARGET_MC_2}`
            });
        }

        // LFG触发单
        if (CONFIG.STRATEGY.LFG_SELL_RATIO > 0) {
            this.orderManager.createOrder({
                positionId: position.id,
                type: OrderType.LFG_SELL,
                sellRatio: CONFIG.STRATEGY.LFG_SELL_RATIO,
                triggerType: TriggerType.LFG_FLAG,
                triggerCondition: 'EQ',
                triggerValue: 1,
                triggerDescription: 'LFG标志触发',
                description: 'LFG triggered sell'
            });
        }

        logger.info(`📋 Created default orders for ${position.symbol}`);
    }

    /**
     * 更新仓位价格
     */
    async updatePosition(address: string, newPrice: number, lfg: number): Promise<Position | null> {
        const position = this.db.getPosition(address);
        if (!position) return null;

        // 更新价格数据
        position.currentPrice = newPrice;
        position.highestPrice = Math.max(position.highestPrice, newPrice);
        position.lowestPrice = Math.min(position.lowestPrice, newPrice);
        position.lastUpdated = Date.now();
        position.lfg = lfg ? 1 : 0;
        // 保存到数据库
        this.db.updatePosition(position);

        // 检查订单触发
        const shouldClosePosition = await this.orderManager.checkAndExecuteOrders(position);
        if (shouldClosePosition) {
            this.closePosition(address);
            return null; // 仓位已关闭
        }
        return position;
    }

    /**
     * 关闭仓位
     */
    closePosition(address: string): void {
        const position = this.db.getPosition(address);
        if (!position) return;

        // 取消所有待执行订单
        const cancelledCount = this.db.cancelPositionOrders(position.id);

        // 删除仓位（会自动删除关联订单）
        this.db.deletePosition(position.id);

        logger.info(`🛑 Position closed: ${position.symbol}, cancelled ${cancelledCount} orders`);
    }

    /**
     * 手动平仓
     */
    async closePositionManually(address: string): Promise<boolean> {
        const position = this.db.getPosition(address);
        if (!position) return false;

        // 创建立即执行的卖出订单
        const success = await this.orderManager.createAndExecuteImmediateOrder({
            positionId: position.id,
            type: OrderType.TAKE_PROFIT,
            sellRatio: 100,
            triggerType: TriggerType.IMMEDIATE,
            triggerCondition: 'EQ',
            triggerValue: 0,
            triggerDescription: '手动平仓',
            description: 'Manual position close'
        }, position);

        if (success) {
            this.closePosition(address);
            return true;
        }

        return false;
    }

    /**
     * 获取仓位
     */
    getPosition(address: string): Position | undefined {
        return this.db.getPosition(address) || undefined;
    }

    /**
     * 获取所有活跃仓位
     */
    getActivePositions(): Position[] {
        return this.db.getActivePositions();
    }

    /**
     * 计算收益率
     */
    calculateGain(position: Position): number {
        return ((position.currentPrice - position.entryPrice) / position.entryPrice) * 100;
    }

    /**
     * 计算回撤
     */
    calculateDrawdown(position: Position): number {
        return ((position.highestPrice - position.currentPrice) / position.highestPrice) * 100;
    }

    /**
     * 获取仓位详情（包括订单）
     */
    getPositionDetails(address: string) {
        const position = this.db.getPosition(address);
        if (!position) return null;

        const orders = this.db.getPositionOrders(position.id);

        return {
            ...position,
            gain: this.calculateGain(position),
            drawdown: this.calculateDrawdown(position),
            orders: orders,
            orderCount: orders.length,
            pendingOrderCount: orders.filter(o => o.status === 'PENDING').length
        };
    }

    /**
     * 添加自定义订单
     */
    addCustomOrder(address: string, orderParams: any): boolean {
        const position = this.db.getPosition(address);
        if (!position) return false;

        try {
            this.orderManager.createOrder({
                ...orderParams,
                positionId: position.id
            });
            return true;
        } catch (error) {
            logger.error(`Failed to add custom order for ${position.symbol}:`, error);
            return false;
        }
    }

    /**
     * 删除订单
     */
    removeOrder(address: string, orderId: string): boolean {
        const position = this.db.getPosition(address);
        if (!position) return false;

        return this.db.cancelOrder(orderId);
    }

    /**
     * 紧急关闭所有仓位
     */
    async emergencyCloseAll(): Promise<void> {
        const positions = this.db.getActivePositions();

        for (const position of positions) {
            await this.closePositionManually(position.address);
        }

        logger.warn('🚨 Emergency close all positions executed');
    }

    /**
     * 获取统计信息
     */
    getStats() {
        const dbStats = this.db.getStats();
        const positions = this.db.getActivePositions();

        return {
            ...dbStats,
            positions: positions.map(p => ({
                symbol: p.symbol,
                address: p.address,
                gain: this.calculateGain(p).toFixed(2),
                status: p.status,
                solInvested: p.solInvested,
                orderCount: this.db.getPositionOrders(p.id).length
            }))
        };
    }
}