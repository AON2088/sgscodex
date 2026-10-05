// 3选1 信息监听工具
// 输出：3个候选物品的 goodsID / chessID / spellID / 名称 / 星级 / 势力
(function() {
    'use strict';

    // ── 通用 getManager ──
    function getManager() {
        try {
            if (Laya && Laya.stage) {
                function find(o) {
                    if (!o) return null;
                    if (o.manager && o.manager.ReqShopRefreshChess) return o.manager;
                    if (o.ReqShopRefreshChess) return o;
                    var c = o._children || o.children || o.childList;
                    if (c) {
                        for (var i = 0; i < c.length; i++) {
                            var r = find(c[i]);
                            if (r) return r;
                        }
                    }
                    if (typeof o.numChildren === 'number' && typeof o.getChildAt === 'function') {
                        for (var i = 0; i < o.numChildren; i++) {
                            try {
                                var r = find(o.getChildAt(i));
                                if (r) return r;
                            } catch(e) {}
                        }
                    }
                    return null;
                }
                var m = find(Laya.stage);
                if (m) return m;
            }
        } catch(e) {}

        for (var k in window) {
            try {
                var o = window[k];
                if (o && o.ReqShopRefreshChess) return o;
                if (o && o.manager && o.manager.ReqShopRefreshChess) return o.manager;
            } catch(e) {}
        }
        return null;
    }

    // ── 势力名映射（从配置里看 MinionType 的数值） ──
    var MINION_NAMES = {
        0: '无',
        1: '魏', 2: '蜀', 3: '吴', 4: '群', 5: '黄巾', 6: '汉',
        7: '西凉', 8: '袁', 9: '神', 10: '蛮夷', 11: '汉室',
        // 具体数值看游戏配置，下面用 TryGetMinionName 兜底
    };

    // ── 安全读属性（兼容不同大小写/字段名） ──
    function pick(obj, keys) {
        if (!obj) return undefined;
        for (var i = 0; i < keys.length; i++) {
            var k = keys[i];
            if (obj[k] !== undefined && obj[k] !== null) return obj[k];
        }
        return undefined;
    }

    // ── 从 CardVO 提取信息 ──
    function extractCardInfo(cardVO, serverInfo) {
        if (!cardVO) return null;

        var info = {
            cardID: pick(cardVO, ['CardID', 'cardID']),
            name: '',
            isChess: false,
            isGold: false,
            star: 0,
            minionType: 0,
            spellRank: '',
            goodsID: undefined,
            chessID: undefined,
            spellID: undefined,
            uniqueId: undefined,
            raw: { cardVO: cardVO, serverInfo: serverInfo }
        };

        // 名称（GetChessName 可能有参数）
        try {
            if (typeof cardVO.GetChessName === 'function') {
                info.name = cardVO.GetChessName(serverInfo);
            } else {
                info.name = pick(cardVO, ['ChessName', 'SpellName', 'CardName', 'Name']) || '未知';
            }
        } catch (e) {
            info.name = '未知';
        }

        // 是否是棋子
        try {
            info.isChess = !!(cardVO.IsChess !== undefined ? cardVO.IsChess : (cardVO.ChessTyp !== undefined));
        } catch (e) {}

        // 是否金色
        try {
            info.isGold = !!(typeof cardVO.IsGold === 'function' ? cardVO.IsGold : cardVO.IsGold);
        } catch (e) {}

        // 星级
        try {
            info.star = pick(cardVO, ['RealChessRank', 'ChessRank']) || 0;
        } catch (e) {}

        // 势力（棋子的 MinionType）
        try {
            if (typeof cardVO.GetMinionTyp === 'function') {
                info.minionType = cardVO.GetMinionTyp(serverInfo);
            } else {
                info.minionType = pick(cardVO, ['MinionType']) || 0;
            }
        } catch (e) {}

        // 锦囊的 rank 文本（"·三" 等）
        try {
            info.spellRank = pick(cardVO, ['SpellTextRank']) || '';
        } catch (e) {}

        // ServerInfo 字段
        if (serverInfo) {
            info.goodsID = pick(serverInfo, ['goodsID', 'GoodsID']);
            info.chessID = pick(serverInfo, ['chessID', 'ChessID']);
            info.spellID = pick(serverInfo, ['spellID', 'SpellID']);
            info.uniqueId = pick(serverInfo, ['UniqueId', 'uniqueId']);
        }

        // cardID 兜底赋值
        if (info.cardID !== undefined) {
            if (info.isChess) {
                if (info.chessID === undefined) info.chessID = info.cardID;
            } else {
                if (info.spellID === undefined) info.spellID = info.cardID;
            }
        }

        return info;
    }

    // ── 格式化输出 ──
    function formatInfo(info, index) {
        if (!info) return '[' + index + '] <null>';
        var parts = [];
        parts.push('[' + index + ']');
        parts.push(info.name || '未知');

        if (info.isChess) {
            var tags = ['棋子'];
            if (info.isGold) tags.push('金');
            if (info.star) tags.push(info.star + '星');
            var mn = MINION_NAMES[info.minionType] || ('势力' + info.minionType);
            tags.push(mn);
            parts.push('(' + tags.join('/') + ')');
        } else {
            parts.push('(锦囊' + (info.spellRank ? info.spellRank : '') + ')');
        }

        var ids = [];
        if (info.goodsID !== undefined) ids.push('goodsID=' + info.goodsID);
        if (info.chessID !== undefined) ids.push('chessID=' + info.chessID);
        if (info.spellID !== undefined) ids.push('spellID=' + info.spellID);
        if (info.cardID !== undefined && info.chessID !== info.cardID && info.spellID !== info.cardID) {
            ids.push('cardID=' + info.cardID);
        }
        if (info.uniqueId !== undefined) ids.push('uniqueId=' + info.uniqueId);
        if (ids.length) parts.push(ids.join(' '));

        return parts.join(' ');
    }

    // ── 读取当前 3 选 1 ──
    function readCurrentSelect() {
        var m = getManager();
        if (!m) {
            console.info('❌ 未找到管理器');
            return null;
        }

        var list = m.WaitSelectCards;
        if (!list || list.length === 0) {
            console.info('ℹ️ 当前没有 3 选 1');
            return null;
        }

        var result = [];
        for (var i = 0; i < list.length; i++) {
            var item = list[i];
            if (!item) { result.push(null); continue; }
            var info = extractCardInfo(item.CardVO, item.ServerInfo);
            info.isSelect = !!item.isSelect;
            result.push(info);
        }
        return result;
    }

    // ── 打印 ──
    function printCurrent() {
        var list = readCurrentSelect();
        if (!list) return null;
        console.info('===== 当前 3 选 1 =====');
        for (var i = 0; i < list.length; i++) {
            console.info(formatInfo(list[i], i));
        }
        console.table(list.map(function (info, i) {
            if (!info) return { index: i, name: '<null>' };
            return {
                index: i,
                name: info.name,
                type: info.isChess ? '棋子' : '锦囊',
                isGold: info.isGold,
                star: info.star,
                minion: MINION_NAMES[info.minionType] || info.minionType,
                spellRank: info.spellRank,
                goodsID: info.goodsID,
                chessID: info.chessID,
                spellID: info.spellID,
                cardID: info.cardID,
                isSelect: info.isSelect
            };
        }));
        return list;
    }

    // ── 自动选择（指定索引，默认 0） ──
    function autoSelect(index) {
        index = index || 0;
        var m = getManager();
        if (!m) { console.info('❌ 未找到管理器'); return false; }

        var list = m.WaitSelectCards;
        if (!list || list.length === 0) {
            console.info('ℹ️ 当前没有 3 选 1');
            return false;
        }
        if (index < 0 || index >= list.length) {
            console.info('❌ 索引越界：' + index);
            return false;
        }

        var item = list[index];
        if (!item) { console.info('❌ 目标为空'); return false; }

        var info = extractCardInfo(item.CardVO, item.ServerInfo);
        console.info('🎯 选择 [' + index + ']:', formatInfo(info, index));

        try {
            // 根据 ServerInfo 判断走哪个协议
            if (item.ServerInfo && item.ServerInfo.goodsID) {
                // 棋子，走 ReqSelectOtherChess
                if (typeof m.ReqSelectOtherChess === 'function') {
                    m.ReqSelectOtherChess(item.ServerInfo.goodsID, false);
                    console.info('✅ ReqSelectOtherChess(goodsID=' + item.ServerInfo.goodsID + ')');
                    return true;
                }
            }
            if (item.CardVO && item.CardVO.CardID) {
                // 可能是锦囊：走 ReqChessSelectSpellID
                if (item.CardVO.IsChess === false && typeof m.ReqChessSelectSpellID === 'function') {
                    m.ReqChessSelectSpellID(item.CardVO.CardID, false);
                    console.info('✅ ReqChessSelectSpellID(cardID=' + item.CardVO.CardID + ')');
                    return true;
                }
                // 棋子备选：走 ReqChessSelectSpellChess
                if (item.CardVO.IsChess === true && typeof m.ReqChessSelectSpellChess === 'function') {
                    // 需要 goodsID，可能来自 ServerInfo 或 CardVO
                    var gid = item.ServerInfo && item.ServerInfo.goodsID;
                    if (gid) {
                        m.ReqChessSelectSpellChess(gid, false);
                        console.info('✅ ReqChessSelectSpellChess(goodsID=' + gid + ')');
                        return true;
                    }
                }
            }
        } catch (e) {
            console.info('⚠️ 选择失败:', e.message);
        }

        console.info('⚠️ 无法确定协议，尝试兜底：ReqSelectOtherChess(CardID)');
        try {
            if (typeof m.ReqSelectOtherChess === 'function' && item.CardVO && item.CardVO.CardID) {
                m.ReqSelectOtherChess(item.CardVO.CardID, false);
                return true;
            }
        } catch (e) {}

        return false;
    }

    // ── 监听 WaitSelectCards 的变化 ──
    var lastSig = '';
    var pollTimer = null;

    function startMonitor(intervalMs) {
        intervalMs = intervalMs || 200;
        if (pollTimer) return;

        pollTimer = setInterval(function () {
            var m = getManager();
            if (!m) return;
            var list = m.WaitSelectCards;
            if (!list || list.length === 0) {
                lastSig = '';
                return;
            }
            // 构建签名，用于检测变化
            var sig = list.map(function (item) {
                if (!item) return 'null';
                var ci = extractCardInfo(item.CardVO, item.ServerInfo);
                if (!ci) return 'null';
                return (ci.cardID || '') + ':' + (ci.goodsID || '') + ':' + (ci.name || '');
            }).join('|');

            if (sig !== lastSig) {
                lastSig = sig;
                console.info('🔔 3 选 1 列表变化，触发监听');
                printCurrent();
                // 这里可以挂回调
                if (window.__threeChooseOne.onChange) {
                    try { window.__threeChooseOne.onChange(readCurrentSelect()); } catch (e) {}
                }
            }
        }, intervalMs);
    }

    function stopMonitor() {
        if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
        lastSig = '';
    }

    // ── 暴露到全局 ──
    window.__threeChooseOne = {
        // 读取当前 3 选 1 的详细信息（返回数组）
        read: readCurrentSelect,
        // 打印到控制台（表格 + 文本）
        print: printCurrent,
        // 自动选择第 index 项（默认第 0 项）
        select: autoSelect,
        // 开始监听，每次 3 选 1 出现/变化时打印
        monitor: startMonitor,
        // 停止监听
        stopMonitor: stopMonitor,
        // 变化回调（可覆盖）
        onChange: null,
        // 势力名映射（可覆盖）
        minionNames: MINION_NAMES
    };

    console.info('===== 3 选 1 信息监听工具已加载 =====');
    console.info('📌 命令:');
    console.info('  __threeChooseOne.print()       - 打印当前 3 选 1 详情（表格）');
    console.info('  __threeChooseOne.read()        - 返回当前 3 选 1 数据数组');
    console.info('  __threeChooseOne.select(0)     - 自动选择第 0 项（可传 0/1/2）');
    console.info('  __threeChooseOne.monitor()     - 开始监听（每 200ms 检查变化）');
    console.info('  __threeChooseOne.stopMonitor() - 停止监听');
    console.info('');
    console.info('💡 示例：');
    console.info('  __threeChooseOne.onChange = function(list){ console.log(list); };');
    console.info('  __threeChooseOne.monitor();');

})();