// === 游戏数据结构 ===
const Game = {
    state: {
        semester: 1,
        week: 1,
        weekInSem: 1,
        gameOver: false,
        isSkippingTurn: false,
        mode: 'nonprofit',
        type: 'vanilla',
        
        player: {
            energy: 10,
            maxEnergy: 10,
            tech: 30,
            culture: 80,
            wealth: 500, 
            passion: 100
        },
        server: {
            hardware: 'vps_basic', 
            health: 100,
            activePlayers: 0,      
            onlinePlayers: 0,      
            hype: 50,              
            reputation: 60,        
            nextBillWeek: 4        
        }
    },

    // 日志队列系统
    logQueue: [],
    isProcessingQueue: false,

    config: {
        energyRegen: 3,
        semesterLength: 24,
        allowance: 50, 
        
        hardwareList: {
            'vps_basic': { name: "入门级VPS", cap: 15, cost: 40, next: 'vps_pro' },
            'vps_pro':   { name: "进阶版VPS", cap: 50, cost: 120, next: 'dedi_used' },
            'dedi_used': { name: "二手独立机", cap: 150, cost: 450, next: 'dedi_pro' },
            'dedi_pro':  { name: "专业独立机", cap: 500, cost: 1200, next: null }
        },

        baseCosts: {
            maintain: 2,
            promote: 3,
            work: 3
        }
    },

    // === 核心方法 ===
    init: function() {
        this.state.mode = selectedOptions.mode;
        this.state.type = selectedOptions.type;
        
        if (this.state.mode === 'commercial') {
            this.state.player.wealth = 1000; 
            this.state.server.reputation = 40;
        } else {
            this.state.server.reputation = 70;
        }

        if (this.state.type === 'modded') {
            this.state.server.hype += 30;
            this.state.server.health = 80;
            this.state.player.tech += 10;
        }

        this.state.server.hardware = 'vps_basic';
        this.state.server.nextBillWeek = 4;

        this.log("服务器初始化完成...", "log-event");
        this.log(`当前配置: [${this.config.hardwareList['vps_basic'].name}] (月租 ¥${this.config.hardwareList['vps_basic'].cost})`);
        
        this.updateUI();
        document.getElementById('setup-modal').classList.add('hidden');
        document.getElementById('overlay').classList.add('hidden');
    },

    // --- 辅助：计算行动消耗 ---
    getActionCost: function(actionType) {
        let cost = this.config.baseCosts[actionType] || 0;
        let reasons = [];

        if (actionType === 'maintain' && this.state.player.tech < 30) {
            cost += 1;
            reasons.push("技术生疏(+1)");
        }
        if (this.state.player.passion < 40 && Math.random() < 0.5) {
            cost += 1;
            reasons.push("心态炸裂(+1)");
        }

        return { total: cost, details: reasons };
    },

    // --- 玩家行动 ---
    actions: {
        maintain: function() {
            const costObj = Game.getActionCost('maintain');
            if (!Game.checkCost(costObj.total, 0)) return;
            
            const baseFix = 20;
            const techBonus = Math.floor(Game.state.player.tech * 0.5);
            const totalFix = baseFix + techBonus;

            Game.state.server.health = Math.min(100, Game.state.server.health + totalFix);
            Game.consumeEnergy(costObj);
            
            Game.state.player.passion -= 2;

            if (Math.random() > 0.7) {
                Game.state.player.tech += 1;
                Game.log(`维护中学到了新知识 (技术+1，热情-2)`);
            } else {
                Game.log(`清理了缓存和日志 (状态+${totalFix}%，热情-2)`);
            }
            Game.updateUI();
        },
        
        promote: function() {
            const costObj = Game.getActionCost('promote');
            if (!Game.checkCost(costObj.total, 50)) return;
            
            const baseHype = 15;
            const cultureBonus = Math.floor(Game.state.player.culture * 0.25);
            const totalHype = baseHype + Math.floor(Math.random() * 10) + cultureBonus;

            Game.state.server.hype += totalHype;
            Game.state.player.wealth -= 50;
            Game.consumeEnergy(costObj);
            
            Game.state.player.passion -= 1;
            
            Game.log(`到处发宣传贴 (人气+${totalHype}，热情-1)`);
            Game.updateUI();
        },

        work: function() {
            const costObj = Game.getActionCost('work');
            if (!Game.checkCost(costObj.total, 0)) return;
            
            const earn = 60 + Math.floor(Math.random() * 40); 
            Game.state.player.wealth += earn;
            Game.consumeEnergy(costObj);
            
            Game.state.player.passion -= 3;
            
            Game.log(`打工赚了 ¥${earn} (热情-3)`);
            Game.updateUI();
        },

        upgrade: function() {
            const currentKey = Game.state.server.hardware;
            const currentHw = Game.config.hardwareList[currentKey];
            const nextKey = currentHw.next;

            if (!nextKey) {
                Game.log("已经是最高配置了！", "log-danger");
                return;
            }

            const nextHw = Game.config.hardwareList[nextKey];
            const upgradeCost = nextHw.cost; 

            if (!Game.checkCost(0, upgradeCost)) return;

            Game.state.server.hardware = nextKey;
            Game.state.player.wealth -= upgradeCost;
            
            Game.state.player.passion = Math.min(100, Game.state.player.passion + 10);
            
            Game.log(`迁移至 [${nextHw.name}]！(热情+10)`, "log-success");
            Game.updateUI();
        }
    },

    consumeEnergy: function(costObj) {
        this.state.player.energy -= costObj.total;
        if (costObj.details.length > 0) {
            this.log(`额外消耗: ${costObj.details.join(', ')}`, "log-danger");
        }
    },

    // --- 核心循环：下一周 ---
    nextTurn: function() {
        if (this.state.gameOver) return;
        const p = this.state.player;
        const s = this.state.server;

        // 0. 学期结算
        if (this.state.weekInSem >= this.config.semesterLength) {
            this.triggerSettlement(true);
            return;
        }

        // 1. 精力透支检查
        if (p.energy <= 0 && !this.state.isSkippingTurn) {
            this.state.isSkippingTurn = true;
            this.log(`⚠️ 精力耗尽，本周强制休息！`, "log-danger");
            this.processRestWeek();
            return;
        }

        // 2. 正常结算
        this.state.isSkippingTurn = false;
        this.log(`--- 第 ${this.state.week} 周结算 ---`, "log-turn");
        p.energy = Math.min(p.maxEnergy, p.energy + this.config.energyRegen);

        // 环境热情判定
        let passionChange = 0;
        let passionReasons = [];
        
        if (s.activePlayers < 5) {
            passionChange -= 2;
            passionReasons.push("没人玩");
        } else if (s.onlinePlayers > 30) {
            passionChange -= 2;
            passionReasons.push("管理压力大");
        }
        
        if (s.health < 50) {
            passionChange -= 3;
            passionReasons.push("Bug频出");
        }

        if (passionChange !== 0) {
            p.passion += passionChange;
            this.log(`热情变动(${passionChange}): ${passionReasons.join(',')}`, passionChange < 0 ? "log-danger" : "");
        }

        // 3. 租金账单检查
        if (this.state.week >= s.nextBillWeek) {
            const hw = this.config.hardwareList[s.hardware];
            if (p.wealth >= hw.cost) {
                p.wealth -= hw.cost;
                s.nextBillWeek += 4;
                this.log(`自动续费 [${hw.name}]: -¥${hw.cost}`, "log-success");
            } else {
                this.triggerSettlement(false, "没钱续费服务器，被服务商停机删库。");
                return;
            }
        } else {
            const weeksLeft = s.nextBillWeek - this.state.week;
            if (weeksLeft <= 1) {
                this.log(`⚠️ 注意：下周需要缴纳租金！`, "log-danger");
            }
        }

        // 4. 服务器流量与性能
        this.processServerMetrics();

        // 5. 事件与判定
        this.triggerEvents();
        
        const failReason = this.checkFailCondition();
        if (failReason) {
            this.triggerSettlement(false, failReason);
            return;
        }

        this.state.week++;
        this.state.weekInSem++;
        this.updateUI();
    },

    processRestWeek: function() {
        const p = this.state.player;
        const s = this.state.server;
        
        this.log(`--- 第 ${this.state.week} 周 (休息中) ---`, "log-turn");
        
        if (this.state.week >= s.nextBillWeek) {
            const hw = this.config.hardwareList[s.hardware];
            if (p.wealth >= hw.cost) {
                p.wealth -= hw.cost;
                s.nextBillWeek += 4;
                this.log(`自动续费: -¥${hw.cost}`);
            } else {
                this.triggerSettlement(false, "卧床休息期间服务器欠费停机。");
                return;
            }
        }

        s.hype = Math.max(0, s.hype - 3); 
        s.health -= 5;
        p.energy = p.maxEnergy;
        this.log("休息恢复了精力，但服务器缺乏维护。");

        this.processServerMetrics();

        const failReason = this.checkFailCondition();
        if (failReason) {
            this.triggerSettlement(false, failReason);
            return;
        }

        this.state.week++;
        this.state.weekInSem++;
        this.updateUI();
    },

    processServerMetrics: function() {
        const s = this.state.server;
        const p = this.state.player;
        const hw = this.config.hardwareList[s.hardware];

        // 1. 活跃玩家
        let newPlayersBase = Math.floor(s.hype / 10);
        let churnRate = 0.05 + (Math.random() * 0.05); 

        if (this.state.type === 'modded') {
            newPlayersBase += 2;
            churnRate -= 0.02; 
            if (s.health < 60) churnRate += 0.15;
        } else {
            churnRate += 0.02;
            if (s.reputation > 80) churnRate -= 0.03;
            if (s.reputation > 70) newPlayersBase += Math.floor((s.reputation - 70) / 10);
        }

        const churnCount = Math.ceil(s.activePlayers * churnRate);
        const netChange = newPlayersBase - churnCount;
        s.activePlayers = Math.max(0, s.activePlayers + netChange);
        
        // 2. 在线人数
        let onlineRatioBase = this.state.type === 'modded' ? 0.22 : 0.18;
        const onlineRatio = onlineRatioBase + (Math.random() * 0.05); 
        let potentialCCU = Math.ceil(s.activePlayers * onlineRatio);

        // 3. 性能判定
        if (potentialCCU > hw.cap) {
            s.onlinePlayers = hw.cap;
            this.log(`⚠️ 满载 (${s.onlinePlayers}/${hw.cap})！排队导致口碑下跌。`, "log-danger");
            s.reputation -= 2; 
            s.hype -= 2;
            p.passion -= 1;
        } else {
            s.onlinePlayers = potentialCCU;
        }

        // 4. 技术衰减
        let decay = this.state.type === 'modded' ? 14 : 7;
        decay = Math.max(2, decay - Math.floor(p.tech / 8)); 
        s.health -= decay;
        s.health = Math.max(0, s.health);

        // 5. 收入计算
        if (this.state.mode === 'commercial') {
            let arpu = this.state.type === 'modded' ? 3.0 : 1.5; 
            const income = Math.floor(s.onlinePlayers * arpu); 
            if (income > 0) {
                p.wealth += income;
                this.log(`玩家充值: +¥${income}`, "log-success");
            }
        } else {
            let donateChance = 0.1;
            if (s.activePlayers > 50) donateChance = 0.25; 
            if (s.activePlayers > 10 && Math.random() < donateChance) {
                const donation = 2 + Math.floor(Math.random() * 8); 
                p.wealth += donation;
                this.log(`收到玩家请喝可乐: +¥${donation}`, "log-success");
            }
            p.wealth += this.config.allowance;
            this.log(`领取零花钱: +¥${this.config.allowance}`);
        }

        // 6. 人气自然衰减
        const hypeDecay = Math.ceil(s.hype * 0.1);
        s.hype = Math.max(0, s.hype - hypeDecay);
    },

    triggerEvents: function() {
        const s = this.state.server;
        const p = this.state.player;

        if (s.health < 30 && Math.random() < 0.6) {
            this.log("🔥 严重故障！服务器强制重启！", "log-danger");
            s.onlinePlayers = 0;
            s.reputation -= 5;
            p.passion -= 10;
            return;
        }

        const events = [
            {
                cond: () => p.culture < 60,
                text: "作业没写完被留堂。",
                effect: () => { p.energy = Math.max(0, p.energy - 3); this.log("精力大幅下降 (-3)！", "log-danger"); }
            },
            {
                cond: () => s.reputation < 30,
                text: "熊孩子炸服！",
                effect: () => { s.hype -= 15; s.health -= 20; this.log("不得不回档，损失惨重。", "log-danger"); }
            },
            {
                cond: () => Math.random() < 0.2,
                text: "宣传视频火了！",
                effect: () => { s.hype += 20; this.log("人气大幅提升！", "log-success"); }
            }
        ];

        const possibleEvents = events.filter(e => e.cond());
        if (possibleEvents.length > 0 && Math.random() > 0.5) {
            const ev = possibleEvents[Math.floor(Math.random() * possibleEvents.length)];
            this.log(`[事件] ${ev.text}`);
            ev.effect();
        }
    },

    checkFailCondition: function() {
        const p = this.state.player;
        if (p.wealth < 0) return "资金链断裂。";
        if (p.passion <= 0) return "你彻底厌倦了开服。";
        return null;
    },

    triggerSettlement: function(isSuccess, reason = "") {
        this.state.gameOver = true;
        const modal = document.getElementById('settlement-modal');
        const overlay = document.getElementById('overlay');
        
        // 结算时确保按钮是解锁状态（防止死锁），但实际上弹窗覆盖了它们
        this.setControls(true);

        const weeksSkipped = this.config.semesterLength - this.state.weekInSem;
        const allowanceTotal = weeksSkipped * this.config.allowance;
        
        const elTitle = document.getElementById('settle-title');
        const elReason = document.getElementById('settle-reason');
        const elTime = document.getElementById('settle-time');
        const elMoney = document.getElementById('settle-money');
        const elHype = document.getElementById('settle-hype');
        const elTech = document.getElementById('settle-tech');

        if (isSuccess) {
            elTitle.innerText = `初中 ${this.state.semester} 年级 - 学期圆满结束`;
            elTitle.style.color = "var(--accent-green)";
            elReason.innerText = "你完美平衡了学业与服务器！";
            elTime.innerText = "按部就班进入假期";
            elMoney.innerText = "无变动";
            elHype.innerText = "100% (完美保留)";
            elTech.innerText = "100% (完美保留)";
        } else {
            elTitle.innerText = `初中 ${this.state.semester} 年级 - 学期中途崩盘`;
            elTitle.style.color = "var(--accent-red)";
            elReason.innerText = `失败原因: ${reason}`;
            elTime.innerText = `跳过 ${weeksSkipped} 周`;
            elMoney.innerText = `获得低保: +¥${allowanceTotal}`;
            
            const hypeRate = 0.3 + Math.random() * 0.3;
            const techRate = 0.6 + Math.random() * 0.3;
            
            elHype.innerText = `${Math.floor(hypeRate * 100)}% (玩家流失)`;
            elTech.innerText = `${Math.floor(techRate * 100)}% (技术生疏)`;
            
            this.tempSettlement = {
                allowance: allowanceTotal,
                hypeRate: hypeRate,
                techRate: techRate
            };
        }

        overlay.classList.remove('hidden');
        modal.classList.remove('hidden');
    },

    startNextSemester: function() {
        const p = this.state.player;
        const s = this.state.server;

        if (this.tempSettlement) {
            p.wealth += this.tempSettlement.allowance;
            s.hype = Math.floor(s.hype * this.tempSettlement.hypeRate);
            p.tech = Math.floor(p.tech * this.tempSettlement.techRate);
            s.activePlayers = Math.floor(s.activePlayers * 0.2); 
            this.tempSettlement = null;
            this.log("⚠️ 经历了失败，一切百废待兴。", "log-danger");
        } else {
            this.log("🎉 新学期开始！继续保持优势。", "log-success");
        }

        this.state.semester++;
        this.state.weekInSem = 1;
        this.state.gameOver = false;
        
        p.energy = p.maxEnergy;
        p.passion = 100;
        s.health = 100;
        s.nextBillWeek = this.state.week + 4; 

        document.querySelector('header h1').innerText = `Minceraft Server (初${this.state.semester})`;
        document.querySelector('.turn-counter').innerHTML = `第 <span id="week-display">${this.state.week}</span> 周 | 初${this.state.semester}`;
        
        document.getElementById('settlement-modal').classList.add('hidden');
        document.getElementById('overlay').classList.add('hidden');
        
        this.updateUI();
    },

    checkCost: function(energy, money) {
        if (this.state.gameOver || this.state.isSkippingTurn || this.isProcessingQueue) return false;
        if (this.state.player.energy < energy) {
            this.log("精力不足！", "log-danger");
            return false;
        }
        if (this.state.player.wealth < money) {
            this.log("资金不足！", "log-danger");
            return false;
        }
        return true;
    },

    // --- 日志与队列系统 (重写) ---
    
    // 1. 调用此方法将消息推入队列
    log: function(msg, className = "") {
        this.logQueue.push({ msg, className, turn: this.state.week });
        
        // 立即禁用按钮，防止玩家插入新操作
        this.setControls(false);
        
        // 如果没有在处理，就开始处理
        if (!this.isProcessingQueue) {
            this.processLogQueue();
        }
    },

    // 2. 递归处理队列
    processLogQueue: function() {
        // 如果队列空了，解锁并退出
        if (this.logQueue.length === 0) {
            this.isProcessingQueue = false;
            if (!this.state.gameOver) {
                this.setControls(true); // 队列处理完，恢复控制
            }
            return;
        }

        this.isProcessingQueue = true;
        const item = this.logQueue.shift();

        // 创建 DOM
        const panel = document.getElementById('log-panel');
        const entry = document.createElement('div');
        entry.className = 'log-entry ' + item.className + ' animate-in'; // 添加动画类
        entry.innerHTML = `<span class="log-turn">W${item.turn}</span> ${item.msg}`;
        panel.insertBefore(entry, panel.firstChild);

        // 递归调用下一条，间隔 300ms
        setTimeout(() => {
            this.processLogQueue();
        }, 300); 
    },

    // 3. 统一控制按钮状态
    setControls: function(enabled) {
        const btns = document.querySelectorAll('.action-btn, #next-week-btn');
        btns.forEach(btn => btn.disabled = !enabled);
    },

    updateUI: function() {
        const p = this.state.player;
        const s = this.state.server;
        const hw = this.config.hardwareList[s.hardware];

        // 注意：这里不再处理 button disabled 状态，而是交给 setControls 和 logQueue 管理
        // 仅在 Game Over 时强制禁用
        if (this.state.gameOver) {
            this.setControls(false);
        }

        const headerText = `第 <span id="week-display">${this.state.week}</span> 周 | 初${this.state.semester}`;
        if(document.querySelector('.turn-counter').innerHTML !== headerText) {
             document.querySelector('.turn-counter').innerHTML = headerText;
        }
        
        document.getElementById('week-display').innerText = this.state.week;
        
        const energyEl = document.getElementById('val-energy');
        energyEl.innerText = `${p.energy}/${p.maxEnergy}`;
        energyEl.style.color = p.energy <= 0 ? 'var(--accent-red)' : 'inherit';

        document.getElementById('val-culture').innerText = p.culture;
        document.getElementById('val-tech').innerText = p.tech;
        document.getElementById('val-wealth').innerText = p.wealth;
        document.getElementById('val-passion').innerText = p.passion;
        
        document.getElementById('val-health').innerText = s.health + "%";
        document.getElementById('val-online').innerText = `${s.onlinePlayers} / ${hw.cap}`;
        document.getElementById('val-active').innerText = s.activePlayers;
        document.getElementById('val-hardware').innerText = hw.name;
        
        const weeksLeft = Math.max(0, s.nextBillWeek - this.state.week);
        const billEl = document.getElementById('val-bill');
        billEl.innerText = `${weeksLeft}周后`;
        billEl.style.color = weeksLeft <= 1 ? 'var(--accent-red)' : 'inherit';

        document.getElementById('val-hype').innerText = s.hype;
        document.getElementById('val-reputation').innerText = s.reputation;

        this.setBar('bar-energy', p.energy, p.maxEnergy);
        this.setBar('bar-passion', p.passion, 100);
        this.setBar('bar-health', s.health, 100);

        const upgradeBtn = document.getElementById('btn-upgrade');
        if (upgradeBtn) {
            if (hw.next) {
                const nextHw = this.config.hardwareList[hw.next];
                upgradeBtn.innerHTML = `🆙 升级: ${nextHw.name}<span class="cost-tag">-¥${nextHw.cost}</span>`;
            } else {
                upgradeBtn.innerHTML = `🆙 已是顶配<span class="cost-tag">MAX</span>`;
                // upgradeBtn.disabled = true; // 顶配逻辑交给 actions 内部判断，或者单独禁用
            }
        }
    },

    setBar: function(id, val, max) {
        const el = document.getElementById(id);
        if (!el) return; 
        const pct = Math.max(0, Math.min(100, (val / max) * 100));
        el.style.width = pct + "%";
        el.className = 'progress-fill';
        if (pct < 20) el.classList.add('fill-danger');
        else if (pct < 50) el.classList.add('fill-warn');
    }
};

let selectedOptions = { mode: 'nonprofit', type: 'vanilla' };

function selectOption(cat, val, btn) {
    selectedOptions[cat] = val;
    const group = btn.parentElement;
    group.querySelectorAll('.choice-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
}

function startGame() {
    Game.init();
}