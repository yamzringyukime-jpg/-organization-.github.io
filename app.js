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
        circleRadius: 132,
        circleCircumference: 2 * Math.PI * 132
    },

    // 現在の状態
    state: {
        current: 'READY',
        seconds: 60,
        timerId: null,
        startTime: null,
        soundEnabled: true,
        csvEnabled: true, // CSV出力設定
        history: []       // セッション履歴
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
        finishBtn: document.getElementById('finish-btn'),
        
        // 設定
        settingsBtn: document.getElementById('settings-btn'),
        settingsPanel: document.getElementById('settings-panel'),
        soundToggle: document.getElementById('sound-toggle'),
        csvToggle: document.getElementById('csv-toggle')
    },

    /**
     * 初期化
     */
    init() {
        // リングの長さをJSの正確な計算と確実に一致させる
        this.elements.progressRing.style.strokeDasharray = this.config.circleCircumference;
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

        this.elements.finishBtn.onclick = () => {
            console.log("🖱 今日の作業終了ボタンがクリックされました");
            this.finishDay();
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

        this.elements.csvToggle.onchange = (e) => {
            this.state.csvEnabled = e.target.checked;
            console.log(`📊 CSV出力: ${this.state.csvEnabled ? 'ON' : 'OFF'}`);
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
            const endTime = Date.now();
            const elapsed = Math.floor((endTime - this.state.startTime) / 1000);
            const label = this.state.current === this.States.WORKING ? "作業" : "休憩";
            
            // 画面上の前回表示更新
            this.updateLastDuration(`前回の${label}`, elapsed);

            // 履歴に保存
            this.state.history.push({
                mode: label,
                start: new Date(this.state.startTime),
                end: new Date(endTime),
                duration: elapsed
            });
            console.log(`📝 履歴に追加: ${label} (${elapsed}s)`);
        }

        this.stopTimer();

        this.state.current = newState;
        this.state.startTime = Date.now();

        // 開始時刻のバッジ表示は削除（要望により）

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
        
        // 精度向上のため30ms間隔(約33fps)でチェックし、絶対時間と比較して更新
        this.state.timerId = setInterval(() => {
            const elapsed = (Date.now() - this.state.startTime) / 1000;
            this.state.seconds = this.config.idlingDuration - elapsed;
            
            if (this.state.seconds <= 0) {
                this.state.seconds = 0;
                this.updateUI();
                this.onIdlingComplete();
                return;
            }
            
            this.updateUI();
        }, 30);
    },

    /**
     * カウントアップ開始 (作業・休憩用)
     */
    startCountUp() {
        // 精度向上のため30ms間隔でチェック
        this.state.timerId = setInterval(() => {
            const elapsed = (Date.now() - this.state.startTime) / 1000;
            this.state.seconds = elapsed;
            this.updateUI();
        }, 30);
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
     * 今日の作業終了：履歴を保存（必要なら）してリセット
     */
    finishDay() {
        // 現在の作業時間も記録に含める
        this.transitionTo('READY');

        if (this.state.csvEnabled && this.state.history.length > 0) {
            this.exportToCSV();
        }

        // 履歴をクリア
        this.state.history = [];
        this.elements.lastDurationContainer.classList.add('hidden');
        console.log("🏁 今日の作業を終了し履歴をリセットしました");
    },

    /**
     * CSV出力処理 (BOM付きUTF-8)
     */
    exportToCSV() {
        const fileName = `pomodoro_history_${new Date().toISOString().slice(0,10).replace(/-/g,'')}.csv`;
        const header = ["モード", "開始時刻", "終了時刻", "経過時間"];
        
        const rows = this.state.history.map(item => {
            const formatTime = (d) => `${d.getFullYear()}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getDate().toString().padStart(2,'0')} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}:${d.getSeconds().toString().padStart(2,'0')}`;
            const formatDuration = (s) => {
                const m = Math.floor(s / 60);
                const rs = s % 60;
                return `${m.toString().padStart(2,'0')}:${rs.toString().padStart(2,'0')}`;
            };
            return [
                item.mode,
                formatTime(item.start),
                formatTime(item.end),
                formatDuration(item.duration)
            ].join(",");
        });

        const csvContent = "\uFEFF" + [header.join(","), ...rows].join("\n");
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        
        if (navigator.msSaveBlob) { // IE 10+
            navigator.msSaveBlob(blob, fileName);
        } else {
            const url = URL.createObjectURL(blob);
            link.href = url;
            link.download = fileName;
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            // メモリ解放のため少し待ってからrevoke
            setTimeout(() => URL.revokeObjectURL(url), 100);
        }
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
        // (カウントダウン時は切り上げを使うことで、表示されている秒数とゲージの描画位置を感覚的にシンクロさせる)
        const displaySecs = current === 'IDLING' ? Math.ceil(seconds) : Math.floor(Math.abs(seconds));
        const mins = Math.floor(displaySecs / 60);
        const secs = displaySecs % 60;
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
        this.elements.finishBtn.classList.toggle('hidden', current === 'READY');

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
     * やる気が出る上昇アルペジオ (C5 -> E5 -> G5)
     */
    playSound() {
        if (!this.state.soundEnabled) return;

        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            
            // 3つの音（アルペジオ）
            const notes = [
                { freq: 523.25, time: 0 },    // C5
                { freq: 659.25, time: 0.15 }, // E5
                { freq: 783.99, time: 0.3 }   // G5
            ];
            
            notes.forEach(note => {
                const oscillator = audioCtx.createOscillator();
                const gainNode = audioCtx.createGain();

                oscillator.type = 'sine';
                oscillator.frequency.setValueAtTime(note.freq, audioCtx.currentTime + note.time);

                gainNode.gain.setValueAtTime(0, audioCtx.currentTime + note.time);
                gainNode.gain.linearRampToValueAtTime(0.1, audioCtx.currentTime + note.time + 0.05);
                gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + note.time + 0.4);

                oscillator.connect(gainNode);
                gainNode.connect(audioCtx.destination);

                oscillator.start(audioCtx.currentTime + note.time);
                oscillator.stop(audioCtx.currentTime + note.time + 0.5);
            });
            
            console.log("🔊 やる気チャイム（上昇アルペジオ）を再生しました");
        } catch (e) {
            console.error("サウンド再生に失敗しました:", e);
        }
    }
};

// 起動 - スクリプト読み込み完了時に即座に初期化
App.init();
