import { PublicKey } from "@solana/web3.js";
import {
    getAssociatedTokenAddress,
    getAccount,
    TokenAccountNotFoundError,
} from "@solana/spl-token";
import { connection, wallet } from "../constants.js";
import logger from "../services/logger.js";

export async function getTokenBalance(tokenMintPublicKey: PublicKey) {
    try {
        const ataPublicKey = await getAssociatedTokenAddress(
            tokenMintPublicKey,
            wallet.publicKey
        );
        const accountInfo = await getAccount(connection, ataPublicKey);

        const res = { balance: accountInfo.amount, ata: ataPublicKey.toBase58() };
        return res;
    } catch (error) {
        if (error instanceof TokenAccountNotFoundError) {
            logger.error(
                `No token account found for ${tokenMintPublicKey.toBase58()}`
            );
        }
        return { balance: null, ata: "" };
    }
}

