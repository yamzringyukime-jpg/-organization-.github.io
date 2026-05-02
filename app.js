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
        csvEnabled: false, // CSV出力設定 (初期OFF)
        performanceMode: false, // 軽量モード (初期OFF)
        taskSuggestions: [], // サジェスト用のタスク名リスト
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
        csvToggle: document.getElementById('csv-toggle'),
        performanceToggle: document.getElementById('performance-toggle'),
        downloadCsvBtn: document.getElementById('download-csv-btn'),
        resetHistoryBtn: document.getElementById('reset-history-btn'),
        
        // タスク関連
        taskInput: document.getElementById('task-input'),
        taskInputContainer: document.getElementById('task-input-wrapper'),
        taskArrow: document.getElementById('task-arrow'),
        taskDropdown: document.getElementById('task-dropdown'),
        taskManageList: document.getElementById('task-manage-list')
    },

    /**
     * 初期化
     */
    init() {
        this.loadSettings();
        // UIに初期値を反映
        this.elements.soundToggle.checked = this.state.soundEnabled;
        this.elements.csvToggle.checked = this.state.csvEnabled;
        this.elements.performanceToggle.checked = this.state.performanceMode;
        this.applyPerformanceMode();

        // リングの長さをJSの正確な計算と確実に一致させる
        this.elements.progressRing.style.strokeDasharray = this.config.circleCircumference;
        this.setupEventListeners();
        this.updateUI();
        this.updateTaskSuggestionsUI();
        this.setProgress(100);
        console.log("🛠 ポモドーロ・アイドリング 初期化完了 - V1.3 (Task Management)");
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
            this.saveSettings();
            console.log(`🔊 音声通知: ${this.state.soundEnabled ? 'ON' : 'OFF'}`);
        };

        this.elements.csvToggle.onchange = (e) => {
            this.state.csvEnabled = e.target.checked;
            this.saveSettings();
            console.log(`📊 CSV出力: ${this.state.csvEnabled ? 'ON' : 'OFF'}`);
        };
        
        this.elements.performanceToggle.onchange = (e) => {
            this.state.performanceMode = e.target.checked;
            this.saveSettings();
            this.applyPerformanceMode();
            console.log(`⚡ 軽量モード: ${this.state.performanceMode ? 'ON' : 'OFF'}`);
        };

        this.elements.downloadCsvBtn.onclick = () => {
            if (this.state.history.length === 0) {
                alert("保存する履歴がありません。");
                return;
            }
            this.exportToCSV();
        };

        this.elements.resetHistoryBtn.onclick = () => {
            if (this.state.history.length === 0) return;
            if (confirm("これまでの作業履歴をリセットしますか？\n（ダウンロードしていない履歴は消去されます）")) {
                this.state.history = [];
                console.log("🗑 履歴をリセットしました");
                alert("履歴をリセットしました。");
            }
        };

        // 外部クリックで各種パネルを閉じる
        document.addEventListener('mousedown', (e) => {
            if (!this.elements.settingsPanel.classList.contains('hidden')) {
                if (!this.elements.settingsPanel.contains(e.target) && e.target !== this.elements.settingsBtn) {
                    this.elements.settingsPanel.classList.add('hidden');
                }
            }
            if (!this.elements.taskDropdown.classList.contains('hidden')) {
                if (!this.elements.taskInputContainer.contains(e.target)) {
                    closeDropdown();
                }
            }
        });

        // カスタムドロップダウンの制御
        const showDropdown = (filterText = null) => {
            if (this.state.current !== 'READY') return;
            const dd = this.elements.taskDropdown;
            dd.innerHTML = '';
            
            const items = filterText 
                ? this.state.taskSuggestions.filter(s => s.toLowerCase().includes(filterText.toLowerCase()))
                : this.state.taskSuggestions;

            if (items.length === 0) {
                dd.innerHTML = '<li class="task-dropdown-empty">履歴がありません</li>';
            } else {
                items.forEach(task => {
                    const li = document.createElement('li');
                    li.textContent = task;
                    li.onmousedown = (e) => {
                        // blurを回避するためにpreventDefault
                        e.preventDefault(); 
                        this.elements.taskInput.value = task;
                        closeDropdown();
                    };
                    dd.appendChild(li);
                });
            }
            dd.classList.remove('hidden');
        };

        const closeDropdown = () => {
            this.elements.taskDropdown.classList.add('hidden');
        };

        let skipFocusFilter = false;

        this.elements.taskInput.onfocus = () => {
            if (this.state.current !== 'READY' || skipFocusFilter) return;
            showDropdown(this.elements.taskInput.value);
        };
        
        this.elements.taskInput.oninput = () => showDropdown(this.elements.taskInput.value);
        this.elements.taskInput.onblur = closeDropdown;

        // カスタム矢印でのトグルと全件展開（フィルタ回避）
        this.elements.taskArrow.onmousedown = (e) => e.preventDefault(); // focus移動を防ぐ
        this.elements.taskArrow.onclick = () => {
            if (this.state.current !== 'READY') return;
            if (!this.elements.taskDropdown.classList.contains('hidden')) {
                closeDropdown();
                return;
            }
            skipFocusFilter = true;
            this.elements.taskInput.focus();
            showDropdown(null);
            setTimeout(() => skipFocusFilter = false, 50);
        };
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
            
            // 現在のタスク名を取得（休憩の場合は直前の作業名を引き継ぐか空にする）
            const taskName = this.elements.taskInput.value.trim() || "(名称未設定)";

            // 画面上の前回表示更新
            this.updateLastDuration(`前回の${label}`, elapsed);

            // 履歴に保存
            this.state.history.push({
                task: label === "作業" ? taskName : (taskName === "(名称未設定)" ? "休憩中" : `${taskName}の休憩`),
                mode: label,
                start: new Date(this.state.startTime),
                end: new Date(endTime),
                duration: elapsed
            });
            
            // 作業開始時かつ新しいタスク名ならサジェストに追加
            if (label === "作業" && taskName !== "(名称未設定)") {
                this.addTaskSuggestion(taskName);
            }

            console.log(`📝 履歴に追加: ${label} [${taskName}] (${elapsed}s)`);
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
        
        // 精度向上のため一定間隔でチェックし、絶対時間と比較して更新
        // 軽量モード時は間隔を広げて負荷を軽減 (200ms = 5fps)
        const interval = this.state.performanceMode ? 200 : 30;
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
        }, interval);
    },

    /**
     * カウントアップ開始 (作業・休憩用)
     */
    startCountUp() {
        // 精度向上のため一定間隔でチェック
        // 軽量モード時は間隔を広げる
        const interval = this.state.performanceMode ? 200 : 30;
        this.state.timerId = setInterval(() => {
            const elapsed = (Date.now() - this.state.startTime) / 1000;
            this.state.seconds = elapsed;
            this.updateUI();
        }, interval);
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

        // 履歴をクリアしない (ユーザーが手動でリセットするかダウンロードするまで保持)
        this.elements.lastDurationContainer.classList.add('hidden');
        console.log("🏁 今日の作業を終了しました（履歴は保持されています）");
    },

    /**
     * CSV出力処理 (BOM付きUTF-8)
     */
    exportToCSV() {
        const fileName = `pomodoro_history_${new Date().toISOString().slice(0,10).replace(/-/g,'')}.csv`;
        const header = ["作業内容", "モード", "開始時刻", "終了時刻", "経過時間"];
        
        const rows = this.state.history.map(item => {
            const formatTime = (d) => `${d.getFullYear()}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getDate().toString().padStart(2,'0')} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}:${d.getSeconds().toString().padStart(2,'0')}`;
            const formatDuration = (s) => {
                const m = Math.floor(s / 60);
                const rs = s % 60;
                return `${m.toString().padStart(2,'0')}:${rs.toString().padStart(2,'0')}`;
            };
            return [
                `"${item.task || ''}"`, // カンマ等が含まれる可能性を考慮
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

        // タスク入力の有効/無効の切り替え（実行中は編集不可に固定）
        this.elements.taskInput.disabled = current !== 'READY';

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
    },

    /**
     * ローカルストレージに設定を保存
     */
    saveSettings() {
        localStorage.setItem('pomodoro_tasks', JSON.stringify(this.state.taskSuggestions));
        localStorage.setItem('pomodoro_sound', JSON.stringify(this.state.soundEnabled));
        localStorage.setItem('pomodoro_csv', JSON.stringify(this.state.csvEnabled));
        localStorage.setItem('pomodoro_performance', JSON.stringify(this.state.performanceMode));
    },

    /**
     * ローカルストレージから設定を読み込み
     */
    loadSettings() {
        const savedTasks = localStorage.getItem('pomodoro_tasks');
        if (savedTasks) {
            try {
                this.state.taskSuggestions = JSON.parse(savedTasks);
            } catch(e) {
                console.error('タスク履歴の読み込みに失敗しました', e);
            }
        }

        const savedSound = localStorage.getItem('pomodoro_sound');
        if (savedSound !== null) {
            try {
                this.state.soundEnabled = JSON.parse(savedSound);
            } catch(e) {}
        }

        const savedCsv = localStorage.getItem('pomodoro_csv');
        if (savedCsv !== null) {
            try {
                this.state.csvEnabled = JSON.parse(savedCsv);
            } catch(e) {}
        }

        const savedPerformance = localStorage.getItem('pomodoro_performance');
        if (savedPerformance !== null) {
            try {
                this.state.performanceMode = JSON.parse(savedPerformance);
            } catch(e) {}
        }
    },

    /**
     * タスクサジェストのUI更新 (管理リストのみ更新)
     */
    updateTaskSuggestionsUI() {
        // 設定パネル内の管理リストの更新
        this.elements.taskManageList.innerHTML = '';
        if (this.state.taskSuggestions.length === 0) {
            this.elements.taskManageList.innerHTML = '<li class="task-item" style="color:var(--text-dim); font-size:0.75rem;">履歴はありません</li>';
            return;
        }

        this.state.taskSuggestions.forEach(task => {
            const li = document.createElement('li');
            li.className = 'task-item';
            li.innerHTML = `
                <span class="task-name">${task}</span>
                <button class="task-delete-btn" aria-label="削除">×</button>
            `;
            
            // 削除ボタンのイベント
            li.querySelector('.task-delete-btn').onclick = () => {
                this.removeTaskSuggestion(task);
            };
            
            this.elements.taskManageList.appendChild(li);
        });
    },

    /**
     * タスク名の新規追加
     */
    addTaskSuggestion(name) {
        if (!this.state.taskSuggestions.includes(name)) {
            this.state.taskSuggestions.unshift(name); // 先頭に追加
            // 最大件数を制限（例：30件）
            if (this.state.taskSuggestions.length > 30) {
                this.state.taskSuggestions.pop();
            }
            this.saveSettings();
            this.updateTaskSuggestionsUI();
        }
    },

    /**
     * タスク名の個別削除
     */
    removeTaskSuggestion(name) {
        this.state.taskSuggestions = this.state.taskSuggestions.filter(t => t !== name);
        this.saveSettings();
        this.updateTaskSuggestionsUI();
    },

    /**
     * 軽量モードの適用（DOMへのクラス付与）
     */
    applyPerformanceMode() {
        if (this.state.performanceMode) {
            document.body.classList.add('performance-mode');
        } else {
            document.body.classList.remove('performance-mode');
        }
    }
};

// 起動 - スクリプト読み込み完了時に即座に初期化
App.init();
