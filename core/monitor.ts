import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { WebSocketHandler } from './websocket';
import logger from "../services/logger";
import { WSMessage } from "../types";


puppeteer.use(StealthPlugin());
// import fs from "fs"
// function findMacBrowser(): string {
//     const possiblePaths = [
//         "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
//         "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
//         "/Applications/Chromium.app/Contents/MacOS/Chromium",
//         "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
//         "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
//     ];

//     for (const path of possiblePaths) {
//         if (fs.existsSync(path)) {
//             return path;
//         }
//     }
// }
export class Monitor {
    private handler: WebSocketHandler;
    private running = false;

    constructor() {
        this.handler = new WebSocketHandler();
    }

    async start(): Promise<void> {
        this.running = true;
        logger.info('🚀 Starting monitor...');

        const browser = await puppeteer.launch({
            headless: true,
            executablePath: '/usr/bin/chromium-browser',
            // executablePath: findMacBrowser(),
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-web-security"
            ]
        });

        const page = await browser.newPage();
        await page.setUserAgent(
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
        );

        const client = await page.target().createCDPSession();
        await client.send("Network.enable");
        await client.send("Runtime.enable");
        client.on("Network.webSocketCreated", (event) => {
            logger.info(`\n🚀 WebSockt created: ${event.url} ${event.requestId}`);
        });
        // 监听WebSocket
        client.on("Network.webSocketFrameReceived", async (event) => {
            try {
                const data = JSON.parse(event.response.payloadData) as WSMessage;
                await this.handler.handleMessage(data);
            } catch (error) {
                // 忽略非JSON消息
            }
        });

        client.on("Network.webSocketClosed", () => {
            logger.warn('WebSocket disconnected');
        });

        // 连接GMGN
        logger.info('Connecting to GMGN...');
        await page.goto("https://gmgn.ai", {
            waitUntil: "networkidle0",
            timeout: 60000
        });

        await page.waitForTimeout(5000);
        logger.info('✅ Connected to GMGN');

        // 保持运行
        while (this.running) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        await browser.close();
    }

    stop(): void {
        this.running = false;
        logger.info('Monitor stopped');
    }
}