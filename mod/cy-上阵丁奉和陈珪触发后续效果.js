(function() {
    "use strict";

    // ── 配置 ──
    // 需要触发当先技能目标选择的棋子 ChessID
    var TARGET_CHESS_IDS = new Set([21108081, 21108082, 21103051, 21103052]);

    // ── 从 Laya.stage 找场景 ──
    function findScene(obj) {
        if (!obj) return null;
        if (obj.constructor && obj.constructor.name === 'TavernChessGameScene') return obj;
        if (obj._children) {
            for (var i = 0; i < obj._children.length; i++) {
                var r = findScene(obj._children[i]);
                if (r) return r;
            }
        }
        return null;
    }

    function toast(text) {
        var old = document.getElementById('sq-toast');
        if (old) old.remove();
        var d = document.createElement('div');
        d.id = 'sq-toast';
        d.textContent = text;
        d.style.cssText = 'position:fixed;top:35%;left:50%;transform:translate(-50%,-50%);z-index:100000;background:rgba(0,0,0,.75);color:#fff;padding:14px 30px;border-radius:10px;font-size:20px;font-weight:bold;pointer-events:none;user-select:none;';
        document.body.appendChild(d);
        setTimeout(function () { d.style.opacity = '0'; setTimeout(function () { d.remove(); }, 300); }, 1200);
    }

    // ── 主流程 ──
    var scene = findScene(Laya.stage);
    if (!scene) { toast("未找到游戏场景"); return; }
    var mgr = scene.manager;
    if (!mgr) { toast("未找到管理器"); return; }

    if (mgr.phase !== 6) { toast("非招募阶段"); return; }
    if (!mgr.CanOperate) { toast("不可操作"); return; }

    var hand = mgr.HandChess;
    if (!hand || hand.length === 0) { toast("手牌为空"); return; }

    // 从右往左找目标棋子
    var targetCard = null;
    for (var i = hand.length - 1; i >= 0; i--) {
        var c = hand[i];
        if (c && TARGET_CHESS_IDS.has(c.chessID)) { targetCard = c; break; }
    }
    if (!targetCard) { toast("手牌中无陈珪/丁奉"); return; }

    var handGoodsID = targetCard.goodsID;
    var skillID = targetCard.skills && targetCard.skills[0] ? targetCard.skills[0].skillID : 0;
    if (!skillID) { toast("技能ID异常"); return; }

    // 目标：上阵区第 0 个
    var battle = mgr.BattleChess;
    if (!battle || battle.length === 0) { toast("场上无目标"); return; }
    var target = battle[0];
    if (!target || !target.goodsID) { toast("场上无目标"); return; }
    var targetGoodsID = target.goodsID;

    // 构建 lineup：棋子放到上阵区末尾空位
    var lineup = mgr.SelfInfo.LineUpGoodsIDs.slice();
    while (lineup.length < 7) lineup.push(0);
    var emptyIndex = lineup.indexOf(0);
    if (emptyIndex === -1) { toast("战斗区已满"); return; }
    lineup[emptyIndex] = handGoodsID;

    // ── 劫持 ReqChessLineUp ──
    // 目的：服务端返回 CMSG_CRESPCHESSCHOOSESKILLTARGET 后，
    //       onRespChessChooseSkillTarget 会调用 ReqChessLineUp(null, true)，
    //       我们把它替换成真正的 lineup。
    var pendingLineup = lineup;
    var origReqChessLineUp = mgr.ReqChessLineUp;

    mgr.ReqChessLineUp = function (e, t, i) {
        if ((e === null || e === undefined) && t === true && pendingLineup) {
            var l = pendingLineup;
            pendingLineup = null;
            mgr.ReqChessLineUp = origReqChessLineUp;
            console.log("[Alt+8 Demo] 劫持 ReqChessLineUp，注入 lineup:", l);
            return origReqChessLineUp.call(mgr, l, t, i);
        }
        return origReqChessLineUp.call(mgr, e, t, i);
    };

    // ── 发送技能目标选择协议 ──
    try {
        mgr.ReqChessChooseSkillTarget([targetGoodsID], skillID, handGoodsID);
        console.log("[Alt+8 Demo] 已发送技能目标:", {
            targetGoodsID: targetGoodsID,
            skillID: skillID,
            handGoodsID: handGoodsID
        });
        toast("已触发自动上阵并指定目标");
    } catch (e) {
        console.error("[Alt+8 Demo] 异常:", e);
        pendingLineup = null;
        mgr.ReqChessLineUp = origReqChessLineUp;
        toast("发送协议失败");
        return;
    }

    // ── 超时兜底 ──
    setTimeout(function () {
        if (pendingLineup) {
            console.warn("[Alt+8 Demo] 服务端超时未响应，恢复 ReqChessLineUp");
            pendingLineup = null;
            mgr.ReqChessLineUp = origReqChessLineUp;
        }
    }, 3000);

})();