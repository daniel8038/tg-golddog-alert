import { TokenData } from "../types";


export function filterToken(item: TokenData): boolean {
    const currentTime = Date.now() / 1000; // 当前时间戳（秒）
    const createdTime = item.ct; // 代币创建时间
    const ageInMinutes = (currentTime - createdTime) / 60; // 转换为分钟
    const oneSocial = !!(item.m_t || item.m_w || item.m_x);

    let flgFilter = !!(
        item.mc >= 20000 &&
        item.mc <= 50000 &&
        item.hd > 200 &&
        item.pg &&
        item.pg < 1 &&
        // ageInMinutes < 60 &&
        item.etpr < 8 && //钓鱼钱包
        item.rat < 8 &&
        item.v1h > 10000 &&
        item.t70_shr < 0.25 &&
        item.kol >= 4 &&
        item.t10 >= 0.15 && item.t10 <= 0.30 &&
        // item.bdc >= 10 &&
        ageInMinutes > 3
    );

    if (flgFilter &&
        item.d_ts === 'creator_close' &&          // Dev已清仓
        item.s_brs === 'burn' &&               // 池子已烧毁
        item.mt === "full" &&                       // 1小时成交量(额) > 20k
        !item.lc_flg &&
        oneSocial
    ) {
        return true;
    }
    return false;
}
// item.bdrr < 0.17 &&                        // 捆绑交易 < 30%
// item.rug === 0 &&                      // 无Rug风险
// item.pg && item.pg < 1 &&                  // 内盘
// item.t70_shr < 0.20 &&                    //狙击