/**
 * カスタム・ポモドーロタイマー
 * ロジック概要:
 * 1. 状態管理 (READY, IDLING, WORKING, BREAKING)
 * 2. タイマー制御 (1分カウントダウン & 無制限カウントアップ)
 * 3. 視覚的フィードバック (円形ゲージのオフセット計算)
 * 4. 通知音 (Web Audio API による波形生成)
 */

const App = {
    // 状態定義
    States: {
        READY: 'READY',
        IDLING: 'IDLING',
        WORKING: 'WORKING',
        BREAKING: 'BREAKING'
    },

    // アプリケーション設定
    config: {
        idlingDuration: 60, // 1分 (秒)
        circleRadius: 135,
        circleCircumference: 2 * Math.PI * 135
    },

    // 現在の状態
    state: {
        current: 'READY',
        seconds: 60,
        timerId: null,
        startTime: null,
        soundEnabled: true
    },

    // DOM要素
    elements: {
        timerText: document.getElementById('timer-text'),
        statusBox: document.getElementById('current-status'),
        statusMsg: document.getElementById('status-message'),
        progressRing: document.querySelector('.progress-ring__circle'),
        
        // 前回時間と開始時刻の表示
        lastDurationContainer: document.getElementById('last-duration-container'),
        lastDurationLabel: document.getElementById('last-duration-label'),
        lastDurationTime: document.getElementById('last-duration-time'),
        startTimeBadge: document.getElementById('current-start-time'),

        // ボタン類
        startBtn: document.getElementById('start-btn'),
        actionBtns: document.getElementById('action-buttons'),
        breakBtn: document.getElementById('break-btn'),
        resumeBtn: document.getElementById('resume-btn'),
        continueBtn: document.getElementById('continue-btn'),
        
        // 設定
        settingsBtn: document.getElementById('settings-btn'),
        settingsPanel: document.getElementById('settings-panel'),
        soundToggle: document.getElementById('sound-toggle')
    },

    /**
     * 初期化
     */
    init() {
        this.setupEventListeners();
        this.updateUI();
        this.setProgress(100);
        console.log("🛠 ポモドーロ・アイドリング 初期化完了 - V1.2");
    },

    /**
     * イベントリスナー設定
     */
    setupEventListeners() {
        // ボタンへのクリックイベント登録
        this.elements.startBtn.onclick = () => {
            console.log("🖱 開始ボタンがクリックされました");
            this.startIdling();
        };

        this.elements.breakBtn.onclick = () => {
            console.log("🖱 休憩ボタンがクリックされました");
            this.transitionTo('BREAKING');
        };

        this.elements.resumeBtn.onclick = () => {
            console.log("🖱 休憩終了（再開）ボタンがクリックされました");
            this.startIdling();
        };

        this.elements.continueBtn.onclick = () => {
            this.transitionTo('WORKING');
        };
        
        // 設定パネルのトグル
        this.elements.settingsBtn.onclick = (e) => {
            e.stopPropagation();
            this.elements.settingsPanel.classList.toggle('hidden');
        };

        this.elements.soundToggle.onchange = (e) => {
            this.state.soundEnabled = e.target.checked;
            console.log(`🔊 音声通知: ${this.state.soundEnabled ? 'ON' : 'OFF'}`);
        };

        // 外部クリックで設定パネルを閉じる
        document.addEventListener('click', (e) => {
            if (!this.elements.settingsPanel.classList.contains('hidden')) {
                if (!this.elements.settingsPanel.contains(e.target)) {
                    this.elements.settingsPanel.classList.add('hidden');
                }
            }
        });
    },

    /**
     * 状態遷移の統合管理
     */
    transitionTo(newState) {
        console.log(`🔄 状態遷移: ${this.state.current} -> ${newState}`);
        
        // 現在のモードの経過時間を計算して保存
        if ((this.state.current === this.States.WORKING || this.state.current === this.States.BREAKING) && this.state.startTime) {
            const elapsed = Math.floor((Date.now() - this.state.startTime) / 1000);
            const label = this.state.current === this.States.WORKING ? "前回の作業" : "前回の休憩";
            this.updateLastDuration(label, elapsed);
        }

        this.stopTimer();

        this.state.current = newState;
        this.state.startTime = Date.now();

        // 開始時刻の表示 (HH:MM)
        const now = new Date();
        const startStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
        this.elements.startTimeBadge.textContent = `(${startStr} 開始)`;

        switch (newState) {
            case this.States.WORKING:
                this.state.seconds = 0;
                this.startCountUp();
                this.elements.statusMsg.textContent = "作業中です。自分のペースで進めましょう。";
                this.elements.lastDurationContainer.classList.remove('hidden');
                break;
            case this.States.BREAKING:
                this.state.seconds = 0;
                this.startCountUp();
                this.elements.statusMsg.textContent = "休憩中です。リラックスしてください。";
                this.elements.lastDurationContainer.classList.remove('hidden');
                break;
            case this.States.IDLING:
                this.elements.lastDurationContainer.classList.remove('hidden');
                break;
            case this.States.READY:
                this.state.seconds = this.config.idlingDuration;
                this.elements.statusMsg.textContent = "「開始」を押して1分間だけ作業しましょう";
                this.elements.lastDurationContainer.classList.add('hidden');
                break;
        }

        this.updateUI();
    },

    /**
     * 前回時間の表示更新
     */
    updateLastDuration(label, seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        const timeStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        
        this.elements.lastDurationLabel.textContent = `${label}:`;
        this.elements.lastDurationTime.textContent = timeStr;
        this.elements.lastDurationContainer.classList.remove('hidden');
    },

    startIdling() {
        this.transitionTo('IDLING');
        this.state.seconds = this.config.idlingDuration;
        this.elements.statusMsg.textContent = "1分間だけ、まず手を動かしてみましょう。";
        
        // 精度向上のため200ms間隔でチェックし、絶対時間と比較して更新
        this.state.timerId = setInterval(() => {
            const elapsed = Math.floor((Date.now() - this.state.startTime) / 1000);
            this.state.seconds = this.config.idlingDuration - elapsed;
            
            if (this.state.seconds <= 0) {
                this.state.seconds = 0;
                this.updateUI();
                this.onIdlingComplete();
                return;
            }
            
            this.updateUI();
        }, 200);
    },

    /**
     * カウントアップ開始 (作業・休憩用)
     */
    startCountUp() {
        // 精度向上のため200ms間隔でチェック
        this.state.timerId = setInterval(() => {
            const elapsed = Math.floor((Date.now() - this.state.startTime) / 1000);
            this.state.seconds = elapsed;
            this.updateUI();
        }, 200);
    },

    /**
     * アイドリング終了時の処理
     */
    onIdlingComplete() {
        console.log("✨ アイドリング終了");
        this.playSound();
        // ユーザーの指示通り：アイドリング後はそのまま作業モードに移行
        this.transitionTo('WORKING');
    },

    /**
     * タイマー停止
     */
    stopTimer() {
        if (this.state.timerId) {
            clearInterval(this.state.timerId);
            this.state.timerId = null;
        }
    },

    /**
     * UIの更新
     */
    updateUI() {
        const { current, seconds } = this.state;
        
        // タイマー文字列の表示 (MM:SS)
        const mins = Math.floor(Math.abs(seconds) / 60);
        const secs = Math.abs(seconds) % 60;
        this.elements.timerText.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

        // 状態バッジの表示
        this.elements.statusBox.classList.remove('active', 'rest');
        if (current === 'WORKING' || current === 'IDLING') {
            this.elements.statusBox.textContent = current === 'IDLING' ? 'アイドリング中' : '作業中';
            this.elements.statusBox.classList.add('active');
        } else if (current === 'BREAKING') {
            this.elements.statusBox.textContent = '休憩中';
            this.elements.statusBox.classList.add('rest');
        } else {
            this.elements.statusBox.textContent = '準備完了';
        }

        // ボタンの表示切り替え
        this.elements.startBtn.classList.toggle('hidden', current !== 'READY');
        this.elements.actionBtns.classList.toggle('hidden', current === 'READY');
        
        this.elements.breakBtn.classList.toggle('hidden', current !== 'WORKING' && current !== 'IDLING');
        this.elements.resumeBtn.classList.toggle('hidden', current !== 'BREAKING');
        this.elements.continueBtn.classList.add('hidden'); 

        // ゲージの更新
        if (current === 'IDLING') {
            const percent = (seconds / this.config.idlingDuration) * 100;
            this.setProgress(percent);
        } else {
            this.setProgress(100);
        }
    },

    /**
     * 円形ゲージの進捗設定
     */
    setProgress(percent) {
        const offset = this.config.circleCircumference - (percent / 100) * this.config.circleCircumference;
        this.elements.progressRing.style.strokeDashoffset = offset;
    },

    /**
     * 通知音の生成 (Web Audio API)
     * 複数のオシレーターを重ねて深みのある音に
     */
    playSound() {
        if (!this.state.soundEnabled) return;

        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            
            // 2つの音（和音）を作成
            const frequencies = [880, 1109]; // A5, C#6 (明るい和音)
            
            frequencies.forEach(freq => {
                const oscillator = audioCtx.createOscillator();
                const gainNode = audioCtx.createGain();

                oscillator.type = 'sine';
                oscillator.frequency.setValueAtTime(freq, audioCtx.currentTime);
                oscillator.frequency.exponentialRampToValueAtTime(freq / 2, audioCtx.currentTime + 0.8);

                gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.8);

                oscillator.connect(gainNode);
                gainNode.connect(audioCtx.destination);

                oscillator.start();
                oscillator.stop(audioCtx.currentTime + 0.8);
            });
            
            console.log("🔊 プレミアム・チャイムを再生しました");
        } catch (e) {
            console.error("サウンド再生に失敗しました:", e);
        }
    }
};

// 起動 - スクリプト読み込み完了時に即座に初期化
App.init();
