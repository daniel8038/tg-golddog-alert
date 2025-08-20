import { sendToTelegram } from '../services/telegram/message';
import { filterToken } from './filterToken';
import { PositionManager } from '../trading/positionManager';
import { OrderManager } from '../trading/orderManager';
import { TradingDatabase } from '../database/tradingDb';
import { TokenData, WSMessage } from '../types';
import { generateTokenMessage } from '../utils/format';
import logger from '../services/logger';
import { CONFIG } from '../config';

export class WebSocketHandler {
    private db: TradingDatabase;
    private orderManager: OrderManager;
    private positionManager: PositionManager;
    private processing = new Set<string>();

    constructor(dbPath?: string) {
        this.db = new TradingDatabase(dbPath);
        this.orderManager = new OrderManager(this.db);
        this.positionManager = new PositionManager(this.db, this.orderManager);

        logger.info('🚀 WebSocket handler initialized with SQLite backend');
    }

    /**
     * 处理WebSocket消息
     */
    async handleMessage(data: WSMessage): Promise<void> {
        if (data.channel !== 'new_pair_update') return;

        // 并行处理多个token，但每个token串行处理
        await Promise.all(data.data.map(token => this.processToken(token)));
    }

    /**
     * 处理单个token
     */
    private async processToken(token: TokenData): Promise<void> {
        const address = token.a;
        const symbol = token.s;
        const price = token.mc;
        if (!address || !symbol || isNaN(price) || price <= 0) return;

        // 防止并发处理同一个token
        if (this.processing.has(address)) return;
        this.processing.add(address);
        try {
            let position = this.positionManager.getPosition(address);
            if (!position) {
                // 检查是否需要创建新仓位
                if (filterToken(token)) {
                    position = await this.positionManager.createPosition(token, CONFIG.SOL_INVESTMENT_AMOUNT);
                    if (position) {
                        const message = generateTokenMessage(token);
                        sendToTelegram(message, "Signal");
                    }
                }
            } else {
                // 更新现有仓位（内部会自动检查和执行订单）
                await this.positionManager.updatePosition(address, price, token.lc_flg);
            }
        } catch (error) {
            logger.error(`Error processing token ${symbol}:`, error);
        } finally {
            this.processing.delete(address);
        }
    }

    // ============= 仓位管理接口 =============

    /**
     * 获取统计信息
     */
    getStats() {
        const positionStats = this.positionManager.getStats();
        const orderStats = this.orderManager.getStats();
        const dbStats = this.db.getStats();

        return {
            positions: positionStats,
            orders: orderStats,
            database: dbStats
        };
    }

    /**
     * 获取活跃仓位
     */
    getActivePositions() {
        return this.positionManager.getActivePositions();
    }

    /**
     * 获取仓位详情
     */
    getPositionDetails(address: string) {
        return this.positionManager.getPositionDetails(address);
    }

    /**
     * 手动关闭仓位
     */
    async closePosition(address: string): Promise<boolean> {
        return await this.positionManager.closePositionManually(address);
    }

    /**
     * 紧急关闭所有仓位
     */
    async emergencyCloseAll(): Promise<void> {
        await this.positionManager.emergencyCloseAll();
    }

    // ============= 订单管理接口 =============

    /**
     * 获取仓位的所有订单
     */
    getPositionOrders(address: string) {
        return this.orderManager.getPositionOrders(address);
    }

    /**
     * 获取待执行订单
     */
    getPendingOrders() {
        return this.orderManager.getPendingOrders();
    }

    /**
     * 获取订单详情
     */
    getOrderDetails(orderId: string) {
        return this.orderManager.getOrder(orderId);
    }

    /**
     * 取消订单
     */
    cancelOrder(orderId: string): boolean {
        return this.orderManager.cancelOrder(orderId);
    }

    /**
     * 取消仓位的所有订单
     */
    cancelPositionOrders(address: string): number {
        return this.orderManager.cancelPositionOrders(address);
    }

    /**
     * 添加自定义订单
     */
    addCustomOrder(address: string, orderParams: any): boolean {
        return this.positionManager.addCustomOrder(address, orderParams);
    }

    /**
     * 删除订单
     */
    removeOrder(address: string, orderId: string): boolean {
        return this.positionManager.removeOrder(address, orderId);
    }

    // ============= 数据查询接口 =============

    /**
     * 获取交易历史
     */
    getTradeHistory(limit: number = 100) {
        return this.db.getTradeHistory(limit);
    }

    /**
     * 获取实时数据（用于监控面板）
     */
    getRealTimeData() {
        const positions = this.getActivePositions();
        const pendingOrders = this.getPendingOrders();
        const stats = this.getStats();

        return {
            positions: positions.map(p => ({
                ...p,
                gain: this.positionManager.calculateGain(p),
                drawdown: this.positionManager.calculateDrawdown(p)
            })),
            pendingOrders: pendingOrders.map(o => ({
                ...o,
                position: this.positionManager.getPosition(o.positionId)
            })),
            stats,
            timestamp: Date.now()
        };
    }

    /**
     * 获取性能指标
     */
    getPerformanceMetrics() {
        const positions = this.getActivePositions();
        const totalGain = positions.reduce((sum, p) => sum + this.positionManager.calculateGain(p), 0);
        const avgGain = positions.length > 0 ? totalGain / positions.length : 0;

        const tradeHistory = this.db.getTradeHistory(1000);
        const successfulTrades = tradeHistory.filter(t => t.gainPercent > 0);
        const successRate = tradeHistory.length > 0 ? successfulTrades.length / tradeHistory.length * 100 : 0;


        return {
            totalPositions: positions.length,
            averageGain: avgGain.toFixed(2),
            successRate: successRate.toFixed(2),
            totalTrades: tradeHistory.length,
        };
    }

    // ============= 数据库管理接口 =============

    /**
     * 清理旧数据
     */
    cleanOldData(): void {
        this.db.cleanOldData();
    }

    /**
     * 备份数据库
     */
    backup(backupPath: string): void {
        this.db.backup(backupPath);
    }

    /**
     * 获取数据库信息
     */
    getDatabaseInfo() {
        const size = this.db.getDbSize();
        const stats = this.db.getStats();

        return {
            size: size.size,
            pageCount: size.pageCount,
            ...stats
        };
    }

    /**
     * 导出数据（用于分析）
     */
    exportData() {
        return {
            positions: this.getActivePositions(),
            orders: this.getPendingOrders(),
            tradeHistory: this.db.getTradeHistory(1000),
            stats: this.getStats(),
            exportTime: new Date().toISOString()
        };
    }

    // ============= 生命周期管理 =============

    /**
     * 关闭处理器
     */
    close(): void {
        this.db.close();
        logger.info('🔒 WebSocket handler closed');
    }

    /**
     * 健康检查
     */
    healthCheck(): { status: 'healthy' | 'unhealthy'; details: any } {
        try {
            const stats = this.getStats();
            return {
                status: 'healthy',
                details: {
                    ...stats,
                    lastCheck: new Date().toISOString()
                }
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                details: {
                    error: error.message,
                    lastCheck: new Date().toISOString()
                }
            };
        }
    }
}