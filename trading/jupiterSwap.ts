import { createJupiterApiClient, QuoteGetRequest } from "@jup-ag/api";
import { VersionedTransaction, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { CONFIG } from '../config';
import { connection, wallet } from "../constants";
import logger from "../services/logger";
import { sendToTelegram } from "../services/telegram/message";
import { getTokenBalance } from "../utils/getTokrnBalance";
import { Position, OrderExecutionResult } from "../types";
import { formatMarketCap } from "../utils/format";

export interface SwapParams {
    inputMint: string;
    outputMint: string;
    amount: number;
    slippageBps: number;
}

const jupiterQuoteApi = createJupiterApiClient();

export async function executeJupiterSwap({
    inputMint,
    outputMint,
    amount,
    slippageBps,
}: SwapParams): Promise<string | null> {
    try {
        // Get quote
        const quoteParams: QuoteGetRequest = {
            inputMint,
            outputMint,
            amount: amount,
            slippageBps,
        };
        const quote = await jupiterQuoteApi.quoteGet(quoteParams);
        if (!quote) {
            throw new Error("Unable to get quote");
        }

        // Get swap transaction
        const swapResponse = await jupiterQuoteApi.swapPost({
            swapRequest: {
                quoteResponse: quote,
                userPublicKey: wallet.publicKey.toBase58(),
                dynamicComputeUnitLimit: true,
                prioritizationFeeLamports: {
                    priorityLevelWithMaxLamports: {
                        maxLamports: 0.0003 * LAMPORTS_PER_SOL,
                        priorityLevel: "high",
                    },
                },
            },
        });

        // Deserialize transaction
        const swapTransactionBuf = Buffer.from(
            swapResponse.swapTransaction,
            "base64"
        );

        const transaction = VersionedTransaction.deserialize(swapTransactionBuf);

        // Sign transaction
        transaction.sign([wallet.payer]);

        // Execute transaction
        const serializedTransaction = Buffer.from(transaction.serialize());
        const signature = await connection.sendRawTransaction(
            serializedTransaction,
            { skipPreflight: true }
        );
        logger.info(`📡 Transaction sent: ${signature}, waiting for confirmation...`);
        return signature
    } catch (error) {
        logger.error("Error executing swap:", error);
        return null;
    }
}

/**
 * 执行买入操作 - 使用固定SOL数量
 */
export async function executeBuy(position: Position): Promise<OrderExecutionResult> {
    try {
        logger.info(`✅ Buying ${position.symbol} with ${position.solInvested} SOL @ MC ${formatMarketCap(position.entryPrice)}`);

        if (!CONFIG.TRADE_ENABLED) {
            logger.info('Trade disabled, simulating buy');
            return {
                success: true,
            };
        }

        // 将SOL数量转换为lamports
        const solAmountLamports = position.solInvested * LAMPORTS_PER_SOL;

        const swapParams = {
            inputMint: "So11111111111111111111111111111111111111112", // SOL
            outputMint: position.address,
            amount: solAmountLamports,
            slippageBps: 4000,
        };

        const signature = await executeJupiterSwap(swapParams);

        if (signature) {
            // 获取买入后的代币余额
            // const tokenBalance = await getTokenBalanceForOrder(position.address);

            const message = `✅ Buy executed: ${signature}`;
            logger.info(message);

            sendToTelegram(`创建新头寸 
Symbol: ${position.symbol}
Address: ${position.address}
Entry MC: ${formatMarketCap(position.entryPrice)}
SOL Invested: ${position.solInvested}
Entry Time: ${(new Date(position.entryTime)).toLocaleString()}
Tx: ${signature}`, "Trade");

            return {
                success: true,
                signature,
            };
        } else {
            return {
                success: false,
                error: 'Failed to get swap signature'
            };
        }

    } catch (error) {
        logger.error(`Buy failed for ${position.symbol}:`, error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * 执行卖出操作 - 按比例卖出当前持有的代币
 */
export async function executeSell(
    address: string,
    symbol: string,
    gain: number,
    sellRatio: number,
    reason?: string
): Promise<OrderExecutionResult> {
    try {
        logger.info(`🔴 Selling ${symbol} ${sellRatio}% gain:${gain.toFixed(0)}% reason: ${reason}`);

        if (!CONFIG.TRADE_ENABLED) {
            logger.info('Trade disabled, simulating sell');
            return {
                success: true,
            };
        }

        // 获取当前代币余额
        const balanceData = await getTokenBalance(new PublicKey(address));
        if (!balanceData.balance || balanceData.balance === 0n) {
            return {
                success: false,
                error: 'No token balance found'
            };
        }

        // 计算要卖出的代币数量（按比例）
        const totalTokenBalance = balanceData.balance;
        const tokenAmountToSell = (totalTokenBalance * BigInt(sellRatio)) / 100n;

        const swapParams: SwapParams = {
            inputMint: address,
            outputMint: "So11111111111111111111111111111111111111112", // SOL
            amount: Number(tokenAmountToSell.toString()),
            slippageBps: 4000,
        };

        const signature = await executeJupiterSwap(swapParams);

        if (signature) {
            const message = `🔴 Sold ${symbol} ${sellRatio}%
Gain: ${gain.toFixed(2)}%
Reason: ${reason}
Tx: ${signature}`;
            // Token Amount: ${Number(tokenAmountToSell).toLocaleString()}

            sendToTelegram(message, "Trade");

            return {
                success: true,
                signature,
            };
        } else {
            return {
                success: false,
                error: 'Failed to get swap signature'
            };
        }

    } catch (error) {
        logger.error(`Sell failed for ${symbol}:`, error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * 获取代币余额（数字格式）
 */
// export async function getTokenBalanceForOrder(address: string): Promise<number> {
//     try {
//         const balanceData = await getTokenBalance(new PublicKey(address));
//         return balanceData.balance ? Number(balanceData.balance.toString()) : 0;
//     } catch (error) {
//         logger.error(`Failed to get token balance for ${address}:`, error);
//         return 0;
//     }
// }

/**
 * 预检查交易可行性
 */
// export async function preCheckSwap(params: SwapParams): Promise<{ valid: boolean; error?: string; quote?: any }> {
//     try {
//         // 如果是卖出，检查代币余额
//         if (params.inputMint !== "So11111111111111111111111111111111111111112") {
//             const balance = await getTokenBalanceForOrder(params.inputMint);
//             if (balance < params.amount) {
//                 return {
//                     valid: false,
//                     error: `Insufficient token balance. Required: ${params.amount.toLocaleString()}, Available: ${balance.toLocaleString()}`
//                 };
//             }
//         }

//         // 获取报价检查
//         const quoteParams: QuoteGetRequest = {
//             inputMint: params.inputMint,
//             outputMint: params.outputMint,
//             amount: params.amount,
//             slippageBps: params.slippageBps,
//         };

//         const quote = await jupiterQuoteApi.quoteGet(quoteParams);
//         if (!quote) {
//             return {
//                 valid: false,
//                 error: 'Unable to get quote from Jupiter'
//             };
//         }

//         return {
//             valid: true,
//             quote
//         };

//     } catch (error) {
//         return {
//             valid: false,
//             error: error.message
//         };
//     }
// }

/**
 * 获取SOL余额
 */
// export async function getSolBalance(): Promise<number> {
//     try {
//         const balance = await connection.getBalance(wallet.publicKey);
//         return balance / LAMPORTS_PER_SOL;
//     } catch (error) {
//         logger.error('Failed to get SOL balance:', error);
//         return 0;
//     }
// }