import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { CONFIG } from '../config';


const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(info => `${info.timestamp} ${info.level}: ${info.message}`)
);

const logger = winston.createLogger({
    level: 'info', // 默认日志级别
    format: logFormat,
    transports: [
        new DailyRotateFile({
            filename: `${CONFIG.LOGGER_FILE_PATH}-%DATE%.log`, // 日志文件命名，%DATE% 会替换为日期
            datePattern: 'YYYY-MM-DD', // 按天轮换
            zippedArchive: false, // 可选：压缩旧日志文件
            maxFiles: '14d', // 保留最近14天的日志文件
            maxSize: '20m', // 可选：每个日志文件最大20MB
        }),
        // 如果是开发环境，也输出到控制台
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(), // 在控制台输出彩色日志
                logFormat
            )
        })
    ]
});

export default logger;