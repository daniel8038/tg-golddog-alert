export const getSellRatio = (percentage: number) => {
    if (percentage < 100) return 0;

    // 计算是第几个阶段：log2(percentage/100)
    const stage = Math.floor(Math.log2(percentage / 100));
    const currentThreshold = 100 * Math.pow(2, stage);
    const nextThreshold = currentThreshold * 2;

    // 确保在当前阶段范围内
    if (percentage >= currentThreshold && percentage < nextThreshold) {
        return stage === 0 ? 50 : 30; // stage 0 是第一次(100-200%)
    }
    return 0;
};

