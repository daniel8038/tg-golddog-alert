import {
    Order,
    OrderType,
    OrderStatus,
    TriggerType,
    OrderCreationParams,
    OrderExecutionResult,
    Position,
    TradeHistoryRecord
} from '../types';
import { TradingDatabase } from '../database/tradingDb';
import { executeBuy, executeSell } from './jupiterSwap';
import { sendToTelegram } from '../services/telegram/message';
import { wait } from '../utils/format';
import logger from '../services/logger';
import { getTokenBalance } from '../utils/getTokrnBalance';
import { PublicKey } from '@solana/web3.js';

export class OrderManager {
    private db: TradingDatabase;
    private executingOrders = new Set<string>(); // 防止重复执行
    private orderCounter = 0;
    constructor(db: TradingDatabase) {
        this.db = db;

        // 启动订单监控
        this.startOrderMonitoring();
    }

    /**
     * 创建订单
     */
    createOrder(params: OrderCreationParams): Order {
        const order: Order = {
            id: this.generateOrderId(params.positionId, params.type),
            positionId: params.positionId,
            type: params.type as OrderType,
            status: OrderStatus.PENDING,
            sellRatio: params.sellRatio,
            triggerType: params.triggerType as TriggerType,
            triggerCondition: params.triggerCondition,
            triggerValue: params.triggerValue,
            triggerDescription: params.triggerDescription,
            createdAt: Date.now(),
            retryCount: 0,
            description: params.description
        };

        this.db.insertOrder(order);
        logger.info(`📋 Created order: ${order.type} (${order.sellRatio}%) for ${params.positionId}`);

        return order;
    }

    /**
     * 检查并执行订单
     */
    async checkAndExecuteOrders(position: Position): Promise<boolean> {
        const pendingOrders = this.db.getPositionOrders(position.id)
            .filter(order => order.status === OrderStatus.PENDING);
        let shouldClosePosition = false;
        for (const order of pendingOrders) {
            if (this.shouldTriggerOrder(order, position)) {
                // 标记为已触发
                order.status = OrderStatus.TRIGGERED;
                order.triggeredAt = Date.now();
                this.db.updateOrder(order);

                // 执行订单
                const result = await this.executeOrder(order, position);
                if (!result.success && result.error === "No token balance available & shouldClosePosition") {
                    shouldClosePosition = true;
                    break;
                }
                if (result.success && order.sellRatio >= 100) {
                    shouldClosePosition = true;
                    logger.info(`🏁 Position ${position.symbol} will be closed due to 100% sell order`);
                    break;
                }
            }
        }
        return shouldClosePosition
    }

    /**
     * 判断订单是否应该触发
     */
    private shouldTriggerOrder(order: Order, position: Position): boolean {
        const { triggerType, triggerCondition, triggerValue } = order;

        switch (triggerType) {
            case 'PRICE':
                return this.checkCondition(position.currentPrice, triggerCondition, triggerValue);

            case 'GAIN_PERCENT':
                const gain = ((position.currentPrice - position.entryPrice) / position.entryPrice) * 100;
                return this.checkCondition(gain, triggerCondition, triggerValue);

            case 'LFG_FLAG':
                return position.lfg === triggerValue;

            case 'IMMEDIATE':
                return true;

            default:
                return false;
        }
    }

    /**
     * 检查条件
     */
    private checkCondition(actual: number, condition: 'GTE' | 'LTE' | 'EQ', target: number): boolean {
        switch (condition) {
            case 'GTE': return actual >= target;
            case 'LTE': return actual <= target;
            case 'EQ': return actual === target;
            default: return false;
        }
    }

    /**
     * 执行订单
     */
    async executeOrder(order: Order, position: Position): Promise<OrderExecutionResult> {
        // 防止重复执行
        if (this.executingOrders.has(order.id)) {
            return { success: false, error: 'Order already executing' };
        }

        this.executingOrders.add(order.id);

        // 更新状态为执行中
        order.status = OrderStatus.EXECUTING;
        this.db.updateOrder(order);

        try {
            let result: OrderExecutionResult;

            if (order.type === OrderType.MARKET_BUY) {
                result = await this.executeBuyOrder(order, position);
            } else {
                result = await this.executeSellOrder(order, position);
            }

            if (result.success) {
                // 执行成功
                order.status = OrderStatus.COMPLETED;
                order.executedAt = Date.now();
                order.signature = result.signature;
                // order.executedTokenAmount = result.executedTokenAmount;

                // 记录交易历史
                this.recordTradeHistory(order, position, result);

                // 发送通知
                this.sendOrderNotification(order, position, result);

                logger.info(`✅ Order executed successfully: ${order.id}`);
            } else {
                // 执行失败
                order.status = OrderStatus.FAILED;
                order.error = result.error;
                order.retryCount++;

                logger.error(`❌ Order execution failed: ${order.id}, error: ${result.error}`);
            }

            this.db.updateOrder(order);
            return result;

        } catch (error) {
            order.status = OrderStatus.FAILED;
            order.error = error.message;
            order.retryCount++;
            this.db.updateOrder(order);

            logger.error(`❌ Order execution error: ${order.id}`, error);
            return { success: false, error: error.message };

        } finally {
            this.executingOrders.delete(order.id);
        }
    }

    /**
     * 执行买入订单
     */
    private async executeBuyOrder(order: Order, position: Position): Promise<OrderExecutionResult> {
        try {
            const result = await executeBuy(position);
            return result;
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 执行卖出订单
     */
    private async executeSellOrder(order: Order, position: Position): Promise<OrderExecutionResult> {
        try {
            // 特殊处理：LFG订单需要等待
            if (order.type === OrderType.LFG_SELL) {
                await wait(2000);
            }

            // 获取当前代币余额
            const currentTokenBalance = await getTokenBalance(new PublicKey(position.address));
            if (currentTokenBalance.balance === 0n) {
                return {
                    success: true,
                    error: 'No token balance available & shouldClosePosition'
                };
            }

            const gain = ((position.currentPrice - position.entryPrice) / position.entryPrice) * 100;

            const result = await executeSell(
                position.address,
                position.symbol,
                gain,
                order.sellRatio,
                order.description
            );

            return result;
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 记录交易历史
     */
    private recordTradeHistory(order: Order, position: Position, result: OrderExecutionResult): void {
        if (order.type === OrderType.MARKET_BUY || !result.signature) return;

        const gain = ((position.currentPrice - position.entryPrice) / position.entryPrice) * 100;

        const tradeRecord: TradeHistoryRecord = {
            positionId: position.id,
            orderId: order.id,
            symbol: position.symbol,
            address: position.address,
            type: order.type,
            sellRatio: order.sellRatio,
            entryPrice: position.entryPrice,
            exitPrice: position.currentPrice,
            gainPercent: gain,
            executedAt: Math.floor(Date.now() / 1000),
            signature: result.signature,
            reason: order.description
        };

        this.db.insertTradeHistory(tradeRecord);
    }

    /**
     * 发送订单通知
     */
    private sendOrderNotification(order: Order, position: Position, result: OrderExecutionResult): void {
        if (order.type === OrderType.MARKET_BUY) {
            sendToTelegram(
                `✅ Buy Order Executed\nSymbol: ${position.symbol}\nSOL Invested: ${position.solInvested}\nTx: ${result.signature}`,
                "Trade"
            );
        } else {
            const gain = ((position.currentPrice - position.entryPrice) / position.entryPrice) * 100;
            const messageType = order.type === OrderType.STOP_LOSS ? "StopLoss" : "TakeProfit";

            sendToTelegram(
                `🔴 ${order.type} Executed\nSymbol: ${position.symbol}\nGain: ${gain.toFixed(2)}%\nSell Ratio: ${order.sellRatio}%\nSOL Reason: ${order.description}\nTx: ${result.signature}`,
                messageType
            );
        }
    }

    /**
     * 创建并立即执行订单
     */
    async createAndExecuteImmediateOrder(params: OrderCreationParams, position: Position): Promise<boolean> {
        const order = this.createOrder(params);
        const result = await this.executeOrder(order, position);
        return result.success;
    }
    private generateOrderId(positionId: string, type: string): string {
        this.orderCounter++;
        const timestamp = Date.now();
        const random = Math.floor(Math.random() * 1000);
        return `${positionId}_${type}_${timestamp}_${this.orderCounter}_${random}`;
    }
    /**
     * 取消订单
     */
    cancelOrder(orderId: string): boolean {
        return this.db.cancelOrder(orderId);
    }

    /**
     * 取消仓位的所有订单
     */
    cancelPositionOrders(positionId: string): number {
        return this.db.cancelPositionOrders(positionId);
    }

    /**
     * 获取订单
     */
    getOrder(orderId: string): Order | undefined {
        return this.db.getOrder(orderId) || undefined;
    }

    /**
     * 获取仓位的所有订单
     */
    getPositionOrders(positionId: string): Order[] {
        return this.db.getPositionOrders(positionId);
    }

    /**
     * 获取待执行订单
     */
    getPendingOrders(): Order[] {
        return this.db.getPendingOrders();
    }

    /**
     * 获取统计信息
     */
    getStats() {
        const allOrders = this.db.getPendingOrders();
        const now = Date.now();
        const oneDayAgo = now - 24 * 60 * 60 * 1000;

        return {
            pending: allOrders.length,
            executing: allOrders.filter(o => o.status === OrderStatus.EXECUTING).length,
            completedToday: this.db.getTradeHistory(1000)
                .filter(t => t.executedAt * 1000 > oneDayAgo).length
        };
    }

    /**
     * 启动订单监控（定期检查失败的订单是否需要重试）
     */
    private startOrderMonitoring(): void {
        setInterval(() => {
            this.retryFailedOrders();
        }, 60000); // 每分钟检查一次
    }

    /**
     * 重试失败的订单
     */
    private retryFailedOrders(): void {
        // 这里可以实现重试逻辑
        // 比如将某些失败的订单重新设置为PENDING状态
        logger.debug('Checking for failed orders to retry...');
    }

    /**
     * 清理完成的订单（可选，用于数据库维护）
     */
    cleanupCompletedOrders(olderThanDays: number = 7): void {
        const cutoffTime = Date.now() - (olderThanDays * 24 * 60 * 60 * 1000);
        // 这里可以实现清理逻辑
        // 比如删除7天前的已完成订单
        logger.info(`Cleaning up orders older than ${olderThanDays} days`);
    }
}