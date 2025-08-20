// ============= 订单相关类型 =============

export enum OrderType {
    MARKET_BUY = 'MARKET_BUY',           // 市价买入
    STOP_LOSS = 'STOP_LOSS',             // 止损单
    TAKE_PROFIT = 'TAKE_PROFIT',         // 止盈单
    LFG_SELL = 'LFG_SELL'               // LFG触发卖出
}

export enum OrderStatus {
    PENDING = 'PENDING',           // 待触发
    TRIGGERED = 'TRIGGERED',       // 已触发
    EXECUTING = 'EXECUTING',       // 执行中
    COMPLETED = 'COMPLETED',       // 已完成
    FAILED = 'FAILED',            // 执行失败
    CANCELLED = 'CANCELLED'        // 已取消
}

export enum TriggerType {
    PRICE = 'PRICE',              // 价格触发 (市值)
    GAIN_PERCENT = 'GAIN_PERCENT', // 收益率触发
    LFG_FLAG = 'LFG_FLAG',        // LFG标志触发
    IMMEDIATE = 'IMMEDIATE'       // 立即执行
}

export interface Order {
    id: string;
    positionId: string;
    type: OrderType;
    status: OrderStatus;

    // 卖出比例 (1-100)
    sellRatio: number;

    // 触发条件
    triggerType: TriggerType;
    triggerCondition: 'GTE' | 'LTE' | 'EQ'; // 大于等于/小于等于/等于
    triggerValue: number;
    triggerDescription: string;

    // 执行信息
    createdAt: number;
    triggeredAt?: number;
    executedAt?: number;
    signature?: string;
    // executedTokenAmount?: number;  // 实际卖出的代币数量
    // receivedSolAmount?: number;    // 实际收到的SOL数量

    // 错误信息
    error?: string;
    retryCount: number;

    // 描述
    description: string;
}

// ============= 仓位类型 =============

export enum PositionStatus {
    ACTIVE = 'ACTIVE'           // 活跃中 (只有一个状态，关闭时直接删除)
}

export interface Position {
    id: string;                 // 使用address作为ID
    address: string;
    symbol: string;

    // 价格信息
    entryPrice: number;         // 买入时的市值
    currentPrice: number;       // 当前市值
    highestPrice: number;       // 历史最高市值
    lowestPrice: number;        // 历史最低市值

    // 投资信息
    solInvested: number;        // 投入的SOL数量

    // 时间信息
    entryTime: number;
    lastUpdated: number;

    // 状态
    status: PositionStatus;
    // 外盘
    lfg: 0 | 1
}

// ============= 其他类型 =============

export interface WSMessage {
    channel: string;
    data: TokenData[];
}

export interface OrderCreationParams {
    positionId: string;
    type: OrderType;
    sellRatio: number;
    triggerType: TriggerType;
    triggerCondition: 'GTE' | 'LTE' | 'EQ';
    triggerValue: number;
    triggerDescription: string;
    description: string;
}

export interface OrderExecutionResult {
    success: boolean;
    signature?: string;
    error?: string;
}

export interface TradeHistoryRecord {
    id?: number;
    positionId: string;
    orderId: string;
    symbol: string;
    address: string;
    type: OrderType;
    sellRatio: number;
    entryPrice: number;
    exitPrice: number;
    gainPercent: number;
    executedAt: number;
    signature: string;
    reason: string;
}

export interface PositionStats {
    totalActivePositions: number;
    totalPendingOrders: number;
    totalCompletedTradesToday: number;
    totalSolInvested: number;
    averageGain: number;
}

// ============= 配置类型 =============

export interface TradingConfig {
    TRADE_ENABLED: boolean;
    SOL_INVESTMENT_AMOUNT: number;  // 每次买入使用的SOL数量
    RISK: {
        MAX_POSITIONS: number;
    };
    STRATEGY: {
        INITIAL_STOP_LOSS: number;      // 初始止损百分比 (负数)
        DOUBLE_PROFIT_THRESHOLD: number; // 翻倍止盈阈值
        DOUBLE_SELL_RATIO: number;      // 翻倍时卖出比例
        TARGET_MC_1: number;            // 目标市值1
        TARGET_MC_1_RATIO: number;      // 目标市值1卖出比例
        TARGET_MC_2: number;            // 目标市值2  
        TARGET_MC_2_RATIO: number;      // 目标市值2卖出比例
        LFG_SELL_RATIO: number;         // LFG触发卖出比例
    };
    SOLANA: {
        WALLET_KEY: string,
        RPC: string
    };
    LOGGER_FILE_PATH: string
}
export interface TokenData {
    _v_ch?: string;       // 频道类型
    a: string;            // 代币地址
    hd: number;           // 持有人数
    mc: number;           // 市值
    pg?: number;           // 进度
    d_ts: string;         // Dev状态
    d_tbr: number;        // Dev当前持币比例
    d_cor: number;        // Dev当前持币比例???
    s_brs: string;        // 烧池子状态
    t10: number;          // 前10大户持仓比例
    bdrr: number;         // 捆绑交易比例
    mt: string;           // Mint权限状态
    rug: number;          // Rug风险评级
    ct: number;           // 创建时间
    nm?: string;          // 代币名称
    s?: string;           // 代币符号
    p?: number;           // 价格
    v1h?: number;         // 1小时交易量
    lq?: string;          // 流动性
    t70_shr?: number;     //狙击
    pa?: string; // 池子
    m_t?: string;
    m_tit?: boolean;
    m_w?: string;
    m_x?: string;
    m_xctc?: number;
    etpr?: number;
    rat?: number;
    lc_flg: number;
    kol: number;
    bdc: number; //交易机器人数量
}

