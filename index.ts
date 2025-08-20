import { Monitor } from './core/monitor';
import logger from './services/logger';


const monitor = new Monitor();

// 优雅退出
process.on('SIGINT', async () => {
    logger.info('Shutting down...');
    monitor.stop();
    process.exit(0);
});

// 错误处理
process.on('unhandledRejection', (error) => {
    logger.error('Unhandled rejection:', error);
});

// 启动
monitor.start().catch(error => {
    logger.error('Failed to start:', error);
    process.exit(1);
});