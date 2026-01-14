// === 游戏数据结构 ===
const Game = {
    state: {
        week: 1,
        gameOver: false,
        mode: 'nonprofit', // nonprofit, commercial
        type: 'vanilla',   // vanilla, modded
        
        // 玩家属性
        player: {
            energy: 100,
            maxEnergy: 100,
            tech: 30,
            culture: 80,
            wealth: 500,
            passion: 100
        },
        // 服务器属性
        server: {
            health: 100,     // 技术状态
            online: 0,       // 当前在线
            capacity: 20,    // 承载力
            hype: 50,        // 人气
            reputation: 60   // 口碑
        }
    },

    // 游戏常量配置
    config: {
        rentPerSlot: 2, 
        actions: {
            maintain: { energy: 30 },
            promote: { energy: 40, cost: 50 },
            study: { energy: 50 },
            work: { energy: 60 },
            upgrade: { cost: 200, capacityAdd: 10 }
        }
    },

    // === 核心方法 ===
    
    init: function() {
        // 读取用户选择
        this.state.mode = selectedOptions.mode;
        this.state.type = selectedOptions.type;
        
        // 根据选择应用初始buff/debuff
        if (this.state.mode === 'commercial') {
            this.state.player.wealth += 500;
            this.state.server.reputation -= 20;
        } else {
            this.state.server.reputation += 20;
        }

        if (this.state.type === 'modded') {
            this.state.server.hype += 30;
            this.state.server.health = 80;
            this.state.player.tech += 10;
        }

        this.log("服务器初始化完成...", "log-event");
this.log(`服务器方案已确认。运营模式: [${this.state.mode === 'nonprofit' ? '公益' : '商业'}] | 架构: [${this.state.type === 'vanilla' ? '纯净' : '模组'}]`);
        this.updateUI();
        
        document.getElementById('setup-modal').classList.add('hidden');
        document.getElementById('overlay').classList.add('hidden');
    },

    // 玩家行动逻辑
    actions: {
        maintain: function() {
            if (!Game.checkCost(30, 0)) return;
            
            const fixAmount = 20 + Math.floor(Game.state.player.tech * 0.5);
            Game.state.server.health = Math.min(100, Game.state.server.health + fixAmount);
            Game.state.player.energy -= 30;
            
            if (Math.random() > 0.7) {
                Game.state.player.tech += 2;
                Game.log("在修复Bug时学到了新知识！技术+2", "log-success");
            } else {
                Game.log(`清理了报错日志，服务器状态回升 (+${fixAmount}%)`);
            }
            Game.updateUI();
        },
        
        promote: function() {
            if (!Game.checkCost(40, 50)) return;
            
            const hypeGain = 10 + Math.floor(Math.random() * 10);
            Game.state.server.hype += hypeGain;
            Game.state.player.energy -= 40;
            
            Game.log(`你决定做一些宣传材料，人气提升 (+${hypeGain})`);
            Game.updateUI();
        },

        study: function() {
            if (!Game.checkCost(50, 0)) return;
            
            const gain = 5 + Math.floor(Math.random() * 5);
            Game.state.player.culture = Math.min(100, Game.state.player.culture + gain);
            Game.state.player.energy -= 50;
            
            Game.log(`你决定学习，学业 (+${gain})`);
            Game.updateUI();
        },

        work: function() {
            if (!Game.checkCost(60, 0)) return;
            
            const earn = 50 + Math.floor(Math.random() * 50);
            Game.state.player.wealth += earn;
            Game.state.player.energy -= 60;
            
            Game.log(`帮隔壁班同学代打排位，赚了 ¥${earn}`);
            Game.updateUI();
        },

        upgrade: function() {
            if (!Game.checkCost(0, 200)) return;
            
            Game.state.server.capacity += 10;
            Game.state.player.wealth -= 200;
            
            Game.log("升级了服务器内存！最大人数 +10", "log-success");
            Game.updateUI();
        }
    },

    // 下一周（核心循环）
    nextTurn: function() {
        if (this.state.gameOver) return;

        const s = this.state.server;
        const p = this.state.player;

        this.log(`--- 第 ${this.state.week} 周结算 ---`, "log-turn");

        // 1. 扣房租
        const rent = s.capacity * this.config.rentPerSlot;
        p.wealth -= rent;
        this.log(`支付服务器租金: -¥${rent}`);

        // 2. 技术状态衰减
        let decay = this.state.type === 'modded' ? 15 : 8;
        decay = Math.max(2, decay - Math.floor(p.tech / 10)); 
        s.health -= decay;
        
        // 3. 计算在线人数
        let potentialPlayers = Math.floor(s.hype * 0.5);
        if (potentialPlayers > s.capacity) {
            this.log("⚠️ 服务器满载！出现卡顿，部分玩家流失。", "log-danger");
            s.reputation -= 2;
            s.activePlayers = s.capacity;
        } else {
            s.activePlayers = potentialPlayers;
        }
        
        // 4. 计算收入
        if (this.state.mode === 'commercial') {
            const income = s.activePlayers * 5;
            if (income > 0) {
                p.wealth += income;
                this.log(`玩家氪金收入: +¥${income}`, "log-success");
            }
        } else {
            const allowance = 50;
            p.wealth += allowance;
            this.log(`本周零花钱: +¥${allowance}`);
        }

        // 5. 事件判定
        this.triggerEvents();

        // 6. 重置与修正
        p.energy = p.maxEnergy;
        s.health = Math.max(0, s.health);
        s.hype = Math.max(0, s.hype - 1);
        
        // 7. 失败判定
        this.checkGameOver();

        this.state.week++;
        this.updateUI();
    },

    // 随机事件系统
    triggerEvents: function() {
        const s = this.state.server;
        const p = this.state.player;

        if (s.health < 30) {
            if (Math.random() < 0.6) {
                this.log("🔥 致命错误！后台无限报错，服务器强制重启！", "log-danger");
                s.activePlayers = 0;
                s.hype -= 10;
                p.passion -= 10;
                return;
            }
        }

        const events = [
            {
                cond: () => p.culture < 60,
                text: "班主任发现你上课睡觉，打电话给了家长。",
                effect: () => { p.passion -= 10; p.energy = 50; this.log("下周精力减半！", "log-danger"); }
            },
            {
                cond: () => s.reputation < 30,
                text: "有熊孩子炸了主城！",
                effect: () => { s.hype -= 15; s.health -= 20; this.log("不得不回档，玩家大量流失。", "log-danger"); }
            },
            {
                cond: () => Math.random() < 0.2,
                text: "有个大佬在群里发布了宣传视频，火了！",
                effect: () => { s.hype += 20; this.log("人气大幅提升！", "log-success"); }
            },
            {
                cond: () => Math.random() < 0.1 && this.state.mode === 'commercial',
                text: "有人举报服务器违反EULA商业协议。",
                effect: () => { s.reputation -= 15; this.log("口碑下降。", "log-danger"); }
            }
        ];

        const possibleEvents = events.filter(e => e.cond());
        if (possibleEvents.length > 0 && Math.random() > 0.5) {
            const ev = possibleEvents[Math.floor(Math.random() * possibleEvents.length)];
            this.log(`[事件] ${ev.text}`);
            ev.effect();
        }
    },

    checkGameOver: function() {
        const p = this.state.player;
        let reason = "";

        if (p.wealth < 0) reason = "资金链断裂，服务器欠费停机。";
        else if (p.culture < 20) reason = "期末考试总分20分，你被送去了戒网瘾学校。";
        else if (p.passion <= 0) reason = "你彻底厌倦了处理熊孩子和报错，删库跑路了。";
        
        if (reason) {
            this.state.gameOver = true;
            document.getElementById('end-reason').innerText = reason;
            document.getElementById('end-weeks').innerText = this.state.week;
            document.getElementById('overlay').classList.remove('hidden');
            document.getElementById('game-over-modal').classList.remove('hidden');
            document.getElementById('setup-modal').classList.add('hidden');
        }
    },

    checkCost: function(energy, money) {
        if (this.state.gameOver) return false;
        if (this.state.player.energy < energy) {
            this.log("精力不足！先休息一下吧 (点击下一周)", "log-danger");
            return false;
        }
        if (this.state.player.wealth < money) {
            this.log("余额不足！", "log-danger");
            return false;
        }
        return true;
    },

    log: function(msg, className = "") {
        const panel = document.getElementById('log-panel');
        const entry = document.createElement('div');
        entry.className = 'log-entry ' + className;
        entry.innerHTML = `<span class="log-turn">W${this.state.week}</span> ${msg}`;
        panel.insertBefore(entry, panel.firstChild);
    },

    updateUI: function() {
        const p = this.state.player;
        const s = this.state.server;

        document.getElementById('week-display').innerText = this.state.week;
        document.getElementById('val-energy').innerText = `${p.energy}/${p.maxEnergy}`;
        document.getElementById('val-culture').innerText = p.culture;
        document.getElementById('val-tech').innerText = p.tech;
        document.getElementById('val-wealth').innerText = p.wealth;
        document.getElementById('val-passion').innerText = p.passion;
        
        document.getElementById('val-health').innerText = s.health + "%";
        document.getElementById('val-online').innerText = s.activePlayers;
        document.getElementById('val-capacity').innerText = s.capacity;
        document.getElementById('val-hype').innerText = s.hype;
        document.getElementById('val-reputation').innerText = s.reputation;

        this.setBar('bar-energy', p.energy, p.maxEnergy);
        this.setBar('bar-culture', p.culture, 100);
        this.setBar('bar-passion', p.passion, 100);
        this.setBar('bar-health', s.health, 100);
    },

    setBar: function(id, val, max) {
        const el = document.getElementById(id);
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