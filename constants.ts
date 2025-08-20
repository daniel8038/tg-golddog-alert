import { Wallet } from "@project-serum/anchor";
import { Connection, Keypair } from "@solana/web3.js";
import bs58 from "bs58";
// import * as dotenv from "dotenv";
import { CONFIG } from "./config";
// dotenv.config();
export const wallet = new Wallet(
  Keypair.fromSecretKey(bs58.decode(CONFIG.SOLANA.WALLET_KEY))
);
export const connection = new Connection(
  CONFIG.SOLANA.RPC
);
