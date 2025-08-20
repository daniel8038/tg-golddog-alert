import Database from 'better-sqlite3';
import { Position, Order, OrderStatus, PositionStatus, TradeHistoryRecord } from '../types';
import logger from '../services/logger';
import path from 'path';

export class TradingDatabase {
    private db: Database.Database;

    constructor(dbPath: string = './data/trading.db') {
        // 确保目录存在
        const dir = path.dirname(dbPath);
        if (!require('fs').existsSync(dir)) {
            require('fs').mkdirSync(dir, { recursive: true });
        }

        this.db = new Database(dbPath);
        this.db.pragma('journal_mode = WAL'); // 提高并发性能
        this.db.pragma('synchronous = NORMAL'); // 平衡性能和安全性
        this.db.pragma('foreign_keys = ON'); // 启用外键约束
        this.initTables();
    }

    private initTables() {
        // 创建仓位表
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS positions (
                id TEXT PRIMARY KEY,
                address TEXT UNIQUE NOT NULL,
                symbol TEXT NOT NULL,
                entry_price REAL NOT NULL,
                current_price REAL NOT NULL,
                highest_price REAL NOT NULL,
                lowest_price REAL NOT NULL,
                sol_invested REAL NOT NULL,
                entry_time INTEGER NOT NULL,
                last_updated INTEGER NOT NULL,
                status TEXT NOT NULL DEFAULT 'ACTIVE',
                created_at INTEGER DEFAULT (strftime('%s','now')),
                lfg REAL DEFAULT 0
            );
        `);

        // 创建订单表
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS orders (
                id TEXT PRIMARY KEY,
                position_id TEXT NOT NULL,
                type TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'PENDING',
                sell_ratio REAL NOT NULL,
                trigger_type TEXT NOT NULL,
                trigger_condition TEXT NOT NULL,
                trigger_value REAL NOT NULL,
                trigger_description TEXT,
                created_at INTEGER NOT NULL,
                triggered_at INTEGER,
                executed_at INTEGER,
                signature TEXT,
                error TEXT,
                retry_count INTEGER DEFAULT 0,
                description TEXT,
                FOREIGN KEY (position_id) REFERENCES positions (id) ON DELETE CASCADE
            );
        `);

        // 创建交易历史表
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS trade_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                position_id TEXT NOT NULL,
                order_id TEXT NOT NULL,
                symbol TEXT NOT NULL,
                address TEXT NOT NULL,
                type TEXT NOT NULL,
                sell_ratio REAL NOT NULL,
                entry_price REAL NOT NULL,
                exit_price REAL NOT NULL,
                gain_percent REAL NOT NULL,
                executed_at INTEGER NOT NULL,
                signature TEXT NOT NULL,
                reason TEXT,
                created_at INTEGER DEFAULT (strftime('%s','now'))
            );
        `);

        // 创建索引
        this.db.exec(`
            CREATE INDEX IF NOT EXISTS idx_positions_address ON positions(address);
            CREATE INDEX IF NOT EXISTS idx_positions_status ON positions(status);
            CREATE INDEX IF NOT EXISTS idx_orders_position_id ON orders(position_id);
            CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
            CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
            CREATE INDEX IF NOT EXISTS idx_trade_history_executed_at ON trade_history(executed_at);
            CREATE INDEX IF NOT EXISTS idx_trade_history_symbol ON trade_history(symbol);
        `);

        logger.info('📊 SQLite database initialized');
    }

    // ============= 仓位操作 =============

    insertPosition(position: Position): void {
        const stmt = this.db.prepare(`
            INSERT INTO positions (
                id, address, symbol, entry_price, current_price, highest_price, lowest_price,
                sol_invested, entry_time, last_updated, status, lfg
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
            position.id,
            position.address,
            position.symbol,
            position.entryPrice,
            position.currentPrice,
            position.highestPrice,
            position.lowestPrice,
            position.solInvested,
            position.entryTime,
            position.lastUpdated,
            position.status,
            position.lfg
        );
    }

    updatePosition(position: Position): void {
        const stmt = this.db.prepare(`
        UPDATE positions SET 
            current_price = ?,
            highest_price = ?,
            lowest_price = ?,
            last_updated = ?,
            lfg = ?
        WHERE id = ?
    `);

        stmt.run(
            position.currentPrice,
            position.highestPrice,
            position.lowestPrice,
            position.lastUpdated,
            position.lfg || 0,
            position.id
        );
    }

    getPosition(address: string): Position | null {
        const stmt = this.db.prepare('SELECT * FROM positions WHERE address = ?');
        const row = stmt.get(address) as any;

        if (!row) return null;

        return {
            id: row.id,
            address: row.address,
            symbol: row.symbol,
            entryPrice: row.entry_price,
            currentPrice: row.current_price,
            highestPrice: row.highest_price,
            lowestPrice: row.lowest_price,
            solInvested: row.sol_invested,
            entryTime: row.entry_time,
            lastUpdated: row.last_updated,
            status: row.status as PositionStatus,
            lfg: row.lfg
        };
    }

    getActivePositions(): Position[] {
        const stmt = this.db.prepare("SELECT * FROM positions WHERE status = 'ACTIVE' ORDER BY entry_time DESC");
        const rows = stmt.all() as any[];

        return rows.map(row => ({
            id: row.id,
            address: row.address,
            symbol: row.symbol,
            entryPrice: row.entry_price,
            currentPrice: row.current_price,
            highestPrice: row.highest_price,
            lowestPrice: row.lowest_price,
            solInvested: row.sol_invested,
            entryTime: row.entry_time,
            lastUpdated: row.last_updated,
            status: row.status as PositionStatus,
            lfg: row.lfg
        }));
    }

    deletePosition(positionId: string): void {
        // 由于外键约束，删除position时会自动删除相关orders
        const stmt = this.db.prepare('DELETE FROM positions WHERE id = ?');
        const result = stmt.run(positionId);
        logger.info(`🗑️ Deleted position ${positionId}, affected rows: ${result.changes}`);
    }

    getPositionCount(): number {
        const stmt = this.db.prepare("SELECT COUNT(*) as count FROM positions WHERE status = 'ACTIVE'");
        const result = stmt.get() as any;
        return result.count;
    }

    // ============= 订单操作 =============

    insertOrder(order: Order): void {
        const stmt = this.db.prepare(`
            INSERT INTO orders (
                id, position_id, type, status, sell_ratio,
                trigger_type, trigger_condition, trigger_value, trigger_description,
                created_at, description, retry_count
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
            order.id,
            order.positionId,
            order.type,
            order.status,
            order.sellRatio,
            order.triggerType,
            order.triggerCondition,
            order.triggerValue,
            order.triggerDescription,
            order.createdAt,
            order.description,
            order.retryCount
        );
    }

    updateOrder(order: Order): void {
        const stmt = this.db.prepare(`
            UPDATE orders SET 
                status = ?,
                triggered_at = ?,
                executed_at = ?,
                signature = ?,
                error = ?,
                retry_count = ?
            WHERE id = ?
        `);

        stmt.run(
            order.status,
            order.triggeredAt || null,
            order.executedAt || null,
            order.signature || null,
            order.error || null,
            order.retryCount,
            order.id
        );
    }

    getOrder(orderId: string): Order | null {
        const stmt = this.db.prepare('SELECT * FROM orders WHERE id = ?');
        const row = stmt.get(orderId) as any;

        if (!row) return null;
        return this.rowToOrder(row);
    }

    getPositionOrders(positionId: string): Order[] {
        const stmt = this.db.prepare('SELECT * FROM orders WHERE position_id = ? ORDER BY created_at DESC');
        const rows = stmt.all(positionId) as any[];

        return rows.map(row => this.rowToOrder(row));
    }

    getPendingOrders(): Order[] {
        const stmt = this.db.prepare("SELECT * FROM orders WHERE status = 'PENDING' ORDER BY created_at ASC");
        const rows = stmt.all() as any[];

        return rows.map(row => this.rowToOrder(row));
    }

    cancelOrder(orderId: string): boolean {
        const stmt = this.db.prepare("UPDATE orders SET status = 'CANCELLED' WHERE id = ? AND status = 'PENDING'");
        const result = stmt.run(orderId);
        return result.changes > 0;
    }

    cancelPositionOrders(positionId: string): number {
        const stmt = this.db.prepare("UPDATE orders SET status = 'CANCELLED' WHERE position_id = ? AND status = 'PENDING'");
        const result = stmt.run(positionId);
        return result.changes;
    }

    deletePositionOrders(positionId: string): void {
        const stmt = this.db.prepare('DELETE FROM orders WHERE position_id = ?');
        stmt.run(positionId);
    }

    private rowToOrder(row: any): Order {
        return {
            id: row.id,
            positionId: row.position_id,
            type: row.type,
            status: row.status as OrderStatus,
            sellRatio: row.sell_ratio,
            triggerType: row.trigger_type,
            triggerCondition: row.trigger_condition,
            triggerValue: row.trigger_value,
            triggerDescription: row.trigger_description,
            createdAt: row.created_at,
            triggeredAt: row.triggered_at,
            executedAt: row.executed_at,
            signature: row.signature,
            error: row.error,
            retryCount: row.retry_count,
            description: row.description
        };
    }

    // ============= 交易历史 =============

    insertTradeHistory(trade: TradeHistoryRecord): void {
        const stmt = this.db.prepare(`
            INSERT INTO trade_history (
                position_id, order_id, symbol, address, type, sell_ratio,
                entry_price, exit_price, gain_percent, executed_at, signature, reason
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
            trade.positionId,
            trade.orderId,
            trade.symbol,
            trade.address,
            trade.type,
            trade.sellRatio,
            trade.entryPrice,
            trade.exitPrice,
            trade.gainPercent,
            trade.executedAt,
            trade.signature,
            trade.reason || null
        );
    }

    getTradeHistory(limit: number = 100): TradeHistoryRecord[] {
        const stmt = this.db.prepare(`
            SELECT * FROM trade_history 
            ORDER BY executed_at DESC 
            LIMIT ?
        `);
        const rows = stmt.all(limit) as any[];

        return rows.map(row => ({
            id: row.id,
            positionId: row.position_id,
            orderId: row.order_id,
            symbol: row.symbol,
            address: row.address,
            type: row.type,
            sellRatio: row.sell_ratio,
            entryPrice: row.entry_price,
            exitPrice: row.exit_price,
            tokenAmountSold: 0, // 不存储这个字段，给默认值
            solReceived: 0,     // 不存储这个字段，给默认值
            gainPercent: row.gain_percent,
            executedAt: row.executed_at,
            signature: row.signature,
            reason: row.reason
        }));
    }

    // ============= 统计信息 =============

    getStats(): {
        activePositions: number;
        pendingOrders: number;
        completedTradesToday: number;
        totalSolInvested: number;
        averageGain: number;
    } {
        const now = Date.now();
        const oneDayAgo = now - 24 * 60 * 60 * 1000;

        // 活跃仓位数
        const activePositions = this.db.prepare("SELECT COUNT(*) as count FROM positions WHERE status = 'ACTIVE'").get() as any;

        // 待执行订单数
        const pendingOrders = this.db.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'PENDING'").get() as any;

        // 今日完成交易数
        const completedToday = this.db.prepare("SELECT COUNT(*) as count FROM trade_history WHERE executed_at > ?").get(Math.floor(oneDayAgo / 1000)) as any;

        // 总投资SOL
        const totalInvested = this.db.prepare("SELECT SUM(sol_invested) as total FROM positions WHERE status = 'ACTIVE'").get() as any;

        // 平均收益率
        const avgGain = this.db.prepare(`
            SELECT AVG((current_price - entry_price) / entry_price * 100) as avg_gain 
            FROM positions WHERE status = 'ACTIVE'
        `).get() as any;

        return {
            activePositions: activePositions.count,
            pendingOrders: pendingOrders.count,
            completedTradesToday: completedToday.count,
            totalSolInvested: totalInvested.total || 0,
            averageGain: avgGain.avg_gain || 0
        };
    }

    // ============= 数据库维护 =============

    // 清理旧数据（保留最近30天）
    cleanOldData(): void {
        const thirtyDaysAgo = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);

        const stmt = this.db.prepare('DELETE FROM trade_history WHERE executed_at < ?');
        const result = stmt.run(thirtyDaysAgo);

        logger.info(`🧹 Cleaned ${result.changes} old trade history records`);
    }

    // 备份数据库
    backup(backupPath: string): void {
        this.db.backup(backupPath);
        logger.info(`💾 Database backed up to ${backupPath}`);
    }

    // 关闭数据库
    close(): void {
        this.db.close();
        logger.info('🔒 Database connection closed');
    }

    // 获取数据库大小
    getDbSize(): { size: string; pageCount: number } {
        const result = this.db.pragma('page_count') as any;
        const pageSize = this.db.pragma('page_size') as any;
        const sizeBytes = result * pageSize;
        const sizeMB = (sizeBytes / 1024 / 1024).toFixed(2);

        return {
            size: `${sizeMB} MB`,
            pageCount: result
        };
    }
}