/* ============ WorkBuddy v2 主逻辑 ============ */
(() => {
  "use strict";

  /* ---------- 工具 ---------- */
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  let toastTimer;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
  }

  function closeModal() { $("#modalMask").classList.remove("show"); }
  function modal({ title, body, okText = "确定", cancelText = "取消", onOk, hideActions = false }) {
    $("#modalTitle").textContent = title;
    $("#modalBody").innerHTML = body;
    $("#modalActions").style.display = hideActions ? "none" : "flex";
    $("#modalOk").textContent = okText;
    $("#modalCancel").textContent = cancelText;
    $("#modalMask").classList.add("show");
    $("#modalOk").onclick = () => { if (onOk && onOk() === false) return; closeModal(); };
    $("#modalCancel").onclick = closeModal;
  }
  const promptModal = (title, placeholder, onOk, type = "text") =>
    modal({
      title,
      body: `<input id="modalInput" type="${type}" inputmode="${type === "number" ? "decimal" : "text"}" placeholder="${esc(placeholder)}"
        style="width:100%;border:1.5px solid var(--card-border);border-radius:12px;padding:12px 14px;font-size:15px;background:var(--bg);color:var(--text)" />`,
      onOk: () => { const v = $("#modalInput").value.trim(); if (v) onOk(v); else return false; },
    });

  const offlineTip = () =>
    `<div class="offline-tip">⚠️ 当前为示例内容${AI.ready() ? "（网络请求失败已自动降级）" : "（在「设置」配置豆包 API Key 后生成今日真实内容）"}</div>`;

  /* ---------- 主题 ---------- */
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    $("#themeBtn").textContent = theme === "dark" ? "☀️" : "🌙";
    Store.saveSettings({ theme });
  }
  applyTheme(Store.getSettings().theme || "light");
  $("#themeBtn").onclick = () =>
    applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");

  /* ---------- 导航 ---------- */
  const TITLES = { home: "首页", study: "学习管理", words: "单词本", speak: "表达能力", news: "每日热点", style: "妆容穿搭", sport: "运动管理", money: "记账", review: "工作复盘", settings: "设置" };
  function go(page) {
    $$(".page").forEach(p => p.classList.toggle("active", p.dataset.page === page));
    $$(".side-item").forEach(b => b.classList.toggle("active", b.dataset.go === page));
    window.scrollTo({ top: 0 });
    renders[page] && renders[page]();
  }
  document.addEventListener("click", e => {
    const btn = e.target.closest("[data-go]");
    if (btn) go(btn.dataset.go);
  });

  /* ---------- 通用 Tabs ---------- */
  document.addEventListener("click", e => {
    const tab = e.target.closest(".tabs > .tab");
    if (!tab) return;
    const group = tab.parentElement;
    $$(".tab", group).forEach(t => t.classList.toggle("active", t === tab));
    const panes = group.parentElement.querySelectorAll(".tab-pane");
    panes.forEach(p => p.classList.toggle("active", p.dataset.pane === tab.dataset.tab));
    const activePage = $(".page.active")?.dataset.page;
    if (activePage === "money") renderMoneyCharts();
  });

  /* ========================================================
   * 首页：时钟 + 习惯打卡 + 一览 + 宫格
   * ======================================================== */
  let clockTimer;
  function tickClock() {
    const d = new Date();
    const p = n => String(n).padStart(2, "0");
    $("#clockTime").textContent = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
    const week = ["日", "一", "二", "三", "四", "五", "六"][d.getDay()];
    $("#clockDate").textContent = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 · 星期${week}`;
  }
  function renderHabits() {
    const habits = Store.getHabits();
    $("#habitGrid").innerHTML = Object.entries(habits).map(([key, h]) => `
      <button class="habit-tile ${Store.habitDone(key) ? "done" : ""}" data-habit="${key}">
        <span class="h-icon">${h.icon}</span>
        <span class="h-name">${h.name}${h.target ? " " + h.target : ""}</span>
        <span class="h-target">${Store.habitDone(key) ? "✓ 已完成" : "点一下打卡"}</span>
      </button>`).join("");
    const streak = Store.habitStreak("early");
    $("#streakLine").textContent = `🌅 早起已连续 ${streak} 天 🔥 · 近两周打卡`;
    $("#weekDots").innerHTML = Store.habitTwoWeeks("early").map(on => `<i class="${on ? "on" : ""}"></i>`).join("");
  }
  $("#habitGrid")?.addEventListener("click", e => {
    const t = e.target.closest("[data-habit]");
    if (!t) return;
    Store.toggleHabit(t.dataset.habit);
    renderHabits(); renderHome();
  });

  function renderHome() {
    tickClock();
    clearInterval(clockTimer);
    clockTimer = setInterval(tickClock, 1000);

    renderHabits();

    const tasks = Store.getTasks();
    $("#statTodo").textContent = `${tasks.filter(t => t.done).length}/${tasks.length}`;
    $("#statBills").textContent = Store.getBillsByDate(Store.today()).length;
    const dw = Store.getDailyWords();
    $("#statWords").textContent = dw.length ? `${Store.getWordIndex()}/${dw.length}` : Store.getWordBook().length;
    $("#statFocus").textContent = Store.getFocusMinutes();

    const checked = Store.isCheckedIn();
    $("#bentoCheckin").classList.toggle("done", checked);
    $("#bentoCheckinSub").textContent = checked ? "✓ 今日已签到" : "点一下开启今天";
  }
  $("#bentoCheckin").onclick = () => {
    const on = Store.toggleCheckin();
    toast(on ? "签到成功，新的一天开始啦！🎉" : "已取消签到");
    renderHome();
  };
  // 首页金句（时钟卡片）
  async function ensureClockQuote() {
    let q = Store.getAiCache("zhQuote");
    if (!q) {
      try { q = await AI.genZhQuote(); Store.setAiCache("zhQuote", q); }
      catch (e) { q = AI.fallback.quote(); }
    }
    $("#clockQuote").textContent = q.quote;
    $("#clockQuoteEn").textContent = q.from ? `—— ${q.from}` : "Daily Workbench";
  }

  /* ========================================================
   * 学习管理
   * ======================================================== */
  const pomo = { total: 25 * 60, left: 25 * 60, timer: null, running: false };
  const fmtTime = s => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  function renderPomo() {
    $("#pomoTime").textContent = fmtTime(pomo.left);
    $("#pomoMode").textContent = pomo.running ? "🔥 专注中……" : `专注 ${pomo.total / 60} 分钟`;
    $("#pomoStart").textContent = pomo.running ? "暂停" : "开始";
  }
  function beep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.25, 0.5].forEach((t, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.frequency.value = [880, 988, 1175][i];
        g.gain.setValueAtTime(0.001, ctx.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + t + 0.03);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.22);
        o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.25);
      });
    } catch (e) { /* 忽略 */ }
  }
  $("#pomoStart").onclick = () => {
    if (pomo.running) { clearInterval(pomo.timer); pomo.running = false; }
    else {
      pomo.running = true;
      pomo.timer = setInterval(() => {
        pomo.left--;
        if (pomo.left <= 0) {
          clearInterval(pomo.timer); pomo.running = false;
          Store.addFocusMinutes(Math.round(pomo.total / 60));
          beep(); toast("⏰ 专注完成！休息一下吧～");
          pomo.left = pomo.total;
          renderStudyStats(); renderHome();
        }
        renderPomo();
      }, 1000);
    }
    renderPomo();
  };
  $("#pomoReset").onclick = () => { clearInterval(pomo.timer); pomo.running = false; pomo.left = pomo.total; renderPomo(); };
  $("#pomoLen").onchange = e => {
    clearInterval(pomo.timer); pomo.running = false;
    pomo.total = pomo.left = Number(e.target.value) * 60;
    renderPomo();
  };
  function renderStudyStats() {
    const fm = Store.data.focusMinutes;
    $("#studyDays").textContent = Object.keys(fm).length;
    $("#studyFocus").textContent = Object.values(fm).reduce((a, b) => a + b, 0);
  }
  function renderTasks() {
    const tasks = Store.getTasks();
    $("#taskList").innerHTML = tasks.length ? tasks.map(t => `
      <div class="task-item ${t.done ? "done" : ""}">
        <button class="task-check" data-task="${t.id}">${t.done ? "✓" : ""}</button>
        <span class="task-text">${esc(t.text)}</span>
        <button class="task-del" data-deltask="${t.id}">🗑</button>
      </div>`).join("") : `<div class="empty">今天还没有学习任务，点右上角添加 🌱</div>`;
    const done = tasks.filter(t => t.done).length;
    $("#sumDone").textContent = `${done} 项`;
    $("#sumUndone").textContent = `${tasks.length - done} 项`;
    $("#sumNote").textContent = tasks.length
      ? (done === tasks.length ? "🎉 全部完成，太棒了！" : `还差 ${tasks.length - done} 项，${done >= tasks.length / 2 ? "过半了，冲刺！" : "先做最难的那件。"}`)
      : "添加 3 件以内的小任务，完成感会更强。";
  }
  $("#addTaskBtn").onclick = () => promptModal("添加学习任务", "如：背 30 个单词 / 看一章专业课", v => { Store.addTask(v); renderTasks(); renderHome(); toast("已添加"); });
  $("#taskList").addEventListener("click", e => {
    const ck = e.target.closest("[data-task]");
    const dl = e.target.closest("[data-deltask]");
    if (ck) { Store.toggleTask(ck.dataset.task); renderTasks(); renderHome(); }
    if (dl) { Store.delTask(dl.dataset.deltask); renderTasks(); renderHome(); }
  });

  /* ========================================================
   * 表达能力：英文晨读 + 口语句 + 金句
   * ======================================================== */
  let currentSentence = "";
  async function ensureEnglish(force = false) {
    const box = $("#enArticle");
    let data = !force && Store.getAiCache("enArticle");
    if (!data) {
      box.innerHTML = `<div class="loading-skeleton"></div><div class="hint">AI 正在撰写今日晨读…</div>`;
      try { data = await AI.genEnglishArticle(); Store.setAiCache("enArticle", data); }
      catch (err) { data = AI.fallback.english(); if (AI.ready()) toast("网络异常，已使用示例内容"); }
    }
    const paras = data.paragraphs.map(p => {
      const sents = AudioKit.splitSentences(p.en);
      return `<p>${sents.map(s => `<span class="sentence" data-en="${esc(s.trim())}">${esc(s.trim())} </span>`).join("")}</p>`;
    }).join("");
    box.innerHTML = `
      ${data._offline ? offlineTip() : ""}
      <div class="article-title">${esc(data.title)}</div>
      <div class="article-meta">${esc(data.type)} · ${esc(data.level)} · 每日晨读</div>
      <div class="audio-bar">
        <button class="audio-btn" id="playAllBtn">🔊 播放全文</button>
        <button class="audio-btn secondary" id="shadowBtn">🎤 跟读这句</button>
        <button class="audio-btn secondary" id="stopBtn">⏹ 停止</button>
      </div>
      <div class="article-body">${paras}</div>
      <div class="article-zh"><b>📖 参考译文</b>${data.paragraphs.map(p => `<p>${esc(p.zh)}</p>`).join("")}</div>
      <div id="shadowScore" class="hint"></div>`;

    $("#playAllBtn").onclick = () => {
      const sents = $$(".sentence", box).map(el => el.dataset.en);
      let i = 0;
      const next = () => {
        if (i >= sents.length) return;
        $$(".sentence", box).forEach(el => el.classList.remove("playing"));
        const el = $$(".sentence", box)[i];
        el.classList.add("playing");
        currentSentence = sents[i];
        AudioKit.speak(sents[i], { rate: 0.88, onEnd: () => { i++; setTimeout(next, 350); } });
      };
      next();
    };
    $("#stopBtn").onclick = () => { AudioKit.stop(); $$(".sentence", box).forEach(el => el.classList.remove("playing")); };
    box.onclick = e => {
      const s = e.target.closest(".sentence");
      if (!s) return;
      $$(".sentence", box).forEach(el => el.classList.remove("playing"));
      s.classList.add("playing");
      currentSentence = s.dataset.en;
      AudioKit.speak(s.dataset.en, { rate: 0.85 });
    };
    $("#shadowBtn").onclick = () => {
      if (!currentSentence) { toast("先点一句英文听一听"); return; }
      $("#shadowScore").textContent = "🎙️ 请对着手机朗读这句话……";
      AudioKit.listenOnce({
        onResult: said => {
          const sc = AudioKit.score(currentSentence, said);
          $("#shadowScore").innerHTML = `你说：<i>${esc(said)}</i><br/>相似度 <b style="color:${sc >= 70 ? "var(--green)" : sc >= 40 ? "var(--amber)" : "var(--danger)"}">${sc} 分</b> — ${sc >= 70 ? "很棒，发音清晰！" : sc >= 40 ? "不错，再多听几遍跟读。" : "再试一次，慢一点读。"}`;
        },
        onError: msg => { $("#shadowScore").textContent = "❌ " + msg; },
      });
    };
  }

  async function ensureSpeakSentences(force = false) {
    let list = !force && Store.getAiCache("speakSentences");
    if (!list) {
      $("#speakList").innerHTML = `<div class="card"><div class="loading-skeleton"></div></div>`;
      try { list = await AI.genSpeakSentences(); Store.setAiCache("speakSentences", list); }
      catch (e) { list = AI.fallback.speakSentences(); }
    }
    $("#speakWords").textContent = (Store.getDailyWords()[0]?.word || "serendipity") + " …";
    $("#speakList").innerHTML = list.map((s, i) => `
      <div class="speak-item">
        <div class="speak-bubble">
          <div class="speak-en">“${esc(s.en)}”</div>
          <div class="speak-zh">${esc(s.zh)}</div>
          <span class="speak-scene">${esc(s.scene)}</span>
          <div class="speak-score" id="spScore${i}"></div>
        </div>
        <button class="speak-play" data-spk="${esc(s.en)}" data-idx="${i}">🔊</button>
      </div>`).join("") + (list[0]?._offline ? offlineTip() : "");
    $$("[data-spk]").forEach(btn => {
      btn.onclick = () => {
        const en = btn.dataset.spk, idx = btn.dataset.idx;
        AudioKit.speak(en, { rate: 0.85 });
        btn.textContent = "🎙️";
        AudioKit.listenOnce({
          onResult: said => {
            btn.textContent = "🔊";
            const sc = AudioKit.score(en, said);
            $(`#spScore${idx}`).innerHTML = `跟读 <b style="color:${sc >= 70 ? "var(--green)" : sc >= 40 ? "var(--amber)" : "var(--danger)"}">${sc} 分</b>：${esc(said)}`;
          },
          onError: msg => { btn.textContent = "🔊"; $(`#spScore${idx}`).textContent = "❌ " + msg; },
        });
      };
    });
  }

  async function ensureQuote(force = false) {
    const box = $("#zhQuote");
    let data = !force && Store.getAiCache("zhQuote");
    if (!data) {
      box.innerHTML = `<div class="loading-skeleton"></div>`;
      try { data = await AI.genZhQuote(); Store.setAiCache("zhQuote", data); }
      catch (e) { data = AI.fallback.quote(); }
    }
    box.innerHTML = `
      ${data._offline ? offlineTip() : ""}
      <div class="quote-mark">"</div>
      <div class="quote-text">${esc(data.quote)}</div>
      <div class="quote-from">—— ${esc(data.from)}</div>
      <button class="audio-btn secondary" id="quoteSpeak" style="margin-top:12px">🔊 听一听</button>
      <div class="quote-zh-note">${esc(data.note)}</div>`;
    $("#quoteSpeak").onclick = () => {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(data.quote);
      u.lang = "zh-CN"; u.rate = 0.95;
      speechSynthesis.speak(u);
    };
  }

  /* ========================================================
   * 单词本（翻面卡片）
   * ======================================================== */
  async function ensureWords(force = false) {
    let words = force ? [] : Store.getDailyWords();
    if (!words.length) {
      if (AI.ready()) {
        $("#wordCardWrap").innerHTML = `<div class="card"><div class="loading-skeleton"></div><div class="hint">AI 正在挑选今日 30 个单词…</div></div>`;
        try { words = await AI.genDailyWords(); Store.setDailyWords(words); }
        catch (e) { words = AI.fallback.words(); Store.setWordIndex(0); if (AI.ready()) toast("网络异常，已使用示例单词"); }
      } else { words = AI.fallback.words(); Store.setWordIndex(0); }
    }
    renderWordStats();
    renderWordCard(words);
    renderWordBook();
  }
  function renderWordStats() {
    const book = Store.getWordBook();
    const days = new Set(book.map(w => w.addedAt).filter(Boolean)).size;
    $("#wordTotalDays").textContent = days;
    $("#wordTotal").textContent = book.length;
    $("#wordBookCount").textContent = book.length;
  }
  function renderWordCard(words) {
    const idx = Store.getWordIndex();
    const total = words.length;
    $("#wordPct").textContent = `${total ? Math.round(Math.min(idx, total) / total * 100) : 0}%`;
    $("#wordProgressBar").style.width = `${total ? Math.min(idx, total) / total * 100 : 0}%`;
    $("#wordProgressNote").textContent = `新词 ${Math.min(idx, total)}/${total} · 复习队列 ${Store.getReviewQueue().length}`;

    if (idx >= total) {
      $("#wordCardWrap").innerHTML = `<div class="card" style="text-align:center;padding:40px 20px">
        <div style="font-size:50px">🎉</div>
        <div style="font-weight:700;font-size:17px;margin:8px 0">今日单词全部处理完！</div>
        <div class="hint">标记「复习」的单词明天会再次推送。</div>
        <button class="btn btn-ghost" id="restartWords" style="margin-top:12px">重新看一遍</button></div>`;
      $("#wordActions").style.display = "none";
      $("#restartWords").onclick = () => { Store.setWordIndex(0); renderWordCard(words); };
      return;
    }
    $("#wordActions").style.display = "flex";
    const w = words[idx];
    $("#wordCardWrap").innerHTML = `
      <div class="word-flip" id="wordFlip">
        <div class="word-inner">
          <div class="word-face word-front">
            <div class="word-emoji">${w.emoji || "🔤"}</div>
            <div class="word-term">${esc(w.word)}</div>
            <div class="word-phon">${esc(w.phonetic || "")}</div>
            <button class="word-speaker" id="wordSpeak">🔊</button>
            <div class="word-flip-hint">点击卡片看中文 ↓</div>
          </div>
          <div class="word-face word-back">
            <div class="word-meaning">${esc(w.meaning)}</div>
            <div class="word-sentence">“${esc(w.sentence)}”</div>
            <div class="word-sentence-zh">${esc(w.sentenceZh || "")}</div>
            <button class="word-speaker" id="wordSpeak2">🔊 听例句</button>
            <div class="word-flip-hint">点击卡片返回 ↑</div>
          </div>
        </div>
      </div>`;
    const flip = $("#wordFlip");
    flip.onclick = () => flip.classList.toggle("flipped");
    $("#wordSpeak").onclick = e => { e.stopPropagation(); AudioKit.speak(w.word, { rate: 0.85 }); };
    $("#wordSpeak2").onclick = e => { e.stopPropagation(); AudioKit.speak(w.sentence, { rate: 0.85 }); };

    const advance = status => {
      Store.markWord(w, status);
      Store.setWordIndex(idx + 1);
      renderWordCard(words); renderWordBook(); renderWordStats(); renderHome();
    };
    $("#wordKnownBtn").onclick = () => advance("known");
    $("#wordReviewBtn").onclick = () => { advance("review"); toast("已加入复习，明天再见 🔁"); };
  }
  function renderWordBook() {
    const book = Store.getWordBook();
    $("#wordBookList").innerHTML = book.length ? book.map(w => `
      <div class="word-book-item">
        <div class="word-book-term">${esc(w.word)}
          <span class="word-book-tag ${w.status === "review" ? "review" : ""}">${w.status === "review" ? "复习中" : "已记住"}</span>
          <button class="task-del" style="float:right" data-delword="${w.id}">🗑</button>
        </div>
        <div class="word-book-meaning">${esc(w.meaning || "")}
          <button class="audio-btn secondary" style="padding:2px 10px;font-size:12px" data-speakword="${esc(w.word)}">🔊</button>
        </div>
        ${w.sentence ? `<div class="word-book-meaning" style="font-style:italic">“${esc(w.sentence)}”</div>` : ""}
      </div>`).join("") : `<div class="empty">单词本还是空的，完成今日单词后自动收集 📚</div>`;
  }
  $("#wordBookList").addEventListener("click", e => {
    const sp = e.target.closest("[data-speakword]");
    const dl = e.target.closest("[data-delword]");
    if (sp) AudioKit.speak(sp.dataset.speakword, { rate: 0.85 });
    if (dl) { Store.delWord(dl.dataset.delword); renderWordBook(); renderWordStats(); renderHome(); }
  });
  // 单词页 chips
  document.addEventListener("click", e => {
    const c = e.target.closest(".chip[data-wtab]");
    if (!c) return;
    $$(".chip[data-wtab]").forEach(x => x.classList.toggle("active", x === c));
    $$(".w-pane").forEach(p => p.classList.toggle("active", p.dataset.wpane === c.dataset.wtab));
  });
  $("#addWordBtn").onclick = () => modal({
    title: "手动添加单词",
    body: `<div class="field"><label>单词</label><input id="mwWord" placeholder="如：serendipity" /></div>
           <div class="field"><label>释义</label><input id="mwMeaning" placeholder="如：n. 意外发现美好事物的能力" /></div>
           <div class="field"><label>例句（可选）</label><input id="mwSentence" /></div>`,
    onOk() {
      const word = $("#mwWord").value.trim();
      if (!word) return false;
      const ok = Store.addWordManual({
        word, phonetic: "", meaning: $("#mwMeaning").value.trim(),
        sentence: $("#mwSentence").value.trim(), sentenceZh: "", emoji: "✍️",
      });
      toast(ok ? "已加入单词本" : "该单词已存在");
      renderWordBook(); renderWordStats(); renderHome();
    },
  });

  /* ========================================================
   * 每日热点
   * ======================================================== */
  const newsState = { cat: "national" };
  async function ensureNews(cat) {
    const box = $("#newsList");
    let data = Store.getAiCache(`news_${cat}`);
    if (!data) {
      box.innerHTML = `<div class="card"><div class="loading-skeleton"></div><div class="hint">AI 正在梳理今日热点…</div></div>`;
      try { data = await AI.genNews(cat); Store.setAiCache(`news_${cat}`, data); }
      catch (e) { data = AI.fallback.news(cat); if (AI.ready()) toast("网络异常，已使用示例内容"); }
    }
    const offline = data._offline || data.items?.[0]?._offline;
    box.innerHTML = (offline ? offlineTip() : "") +
      data.items.map((n, i) => `
      <div class="card news-item">
        <div class="news-title"><span class="news-num">${i + 1}</span>${esc(n.title)}</div>
        <div class="news-source">来源：${esc(n.source || "网络综合")}</div>
        <div class="news-content">${esc(n.content)}</div>
      </div>`).join("");
  }
  $("#newsCat").addEventListener("click", e => {
    const chip = e.target.closest(".chip[data-cat]");
    if (!chip) return;
    $$(".chip", $("#newsCat")).forEach(c => c.classList.toggle("active", c === chip));
    newsState.cat = chip.dataset.cat;
    ensureNews(newsState.cat);
  });

  /* ========================================================
   * 妆容穿搭
   * ======================================================== */
  function videoLinks(keyword) {
    const kw = encodeURIComponent(keyword);
    return `<div class="audio-bar">
      <a class="audio-btn" href="https://search.bilibili.com/all?keyword=${kw}" target="_blank" rel="noopener">📺 B站搜教程</a>
      <a class="audio-btn secondary" href="https://www.xiaohongshu.com/search_result?keyword=${kw}" target="_blank" rel="noopener">📕 小红书搜同款</a>
    </div>`;
  }
  async function ensureStyle(kind) {
    const box = $("#styleCard");
    let data = Store.getAiCache(`style_${kind}`);
    if (!data) {
      box.innerHTML = `<div class="card"><div class="loading-skeleton"></div><div class="hint">AI 正在准备今日推荐…</div></div>`;
      try { data = await AI.genStyle(kind); Store.setAiCache(`style_${kind}`, data); }
      catch (e) { data = AI.fallback.style(kind); if (AI.ready()) toast("网络异常，已使用示例内容"); }
    }
    const offline = data._offline ? offlineTip() : "";
    if (kind === "makeup") {
      box.innerHTML = `${offline}<div class="card">
        <div class="style-cover">${data.emoji || "💄"}</div>
        <div class="style-title">${esc(data.title)}</div>
        <span class="style-season">${esc(data.look || "")}</span>
        <ol class="style-steps">${(data.steps || []).map((s, i) => `<li><b>第 ${i + 1} 步</b>｜${esc(s)}</li>`).join("")}</ol>
        <div class="style-tip">💡 ${esc(data.tip)}</div>
        ${videoLinks(data.videoKeyword || "日常通勤妆容教程")}
      </div>`;
    } else {
      box.innerHTML = `${offline}<div class="card">
        <div class="style-cover">${data.emoji || "👗"}</div>
        <div class="style-title">${esc(data.title)}</div>
        <span class="style-season">${esc(data.season || "")}季推荐</span>
        <div class="style-steps">${(data.pieces || []).map(p => `<li>👚 ${esc(p)}</li>`).join("")}</div>
        <div class="style-tip">🎨 ${esc(data.style)}<br/><br/>💡 ${esc(data.tip)}</div>
        ${videoLinks(data.videoKeyword || "通勤穿搭")}
      </div>`;
    }
  }
  document.addEventListener("click", e => {
    const b = e.target.closest(".seg-btn[data-style]");
    if (!b) return;
    $$(".seg-btn[data-style]").forEach(x => x.classList.toggle("active", x === b));
    ensureStyle(b.dataset.style);
  });

  /* ========================================================
   * 运动管理
   * ======================================================== */
  function drawLineChart(canvas, points, { color = "#10b981" } = {}) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = 160;
    if (!w) return;
    canvas.width = w * dpr; canvas.height = h * dpr;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    if (!points.length) {
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--text-3");
      ctx.font = "13px sans-serif"; ctx.textAlign = "center";
      ctx.fillText("暂无数据，记录第一条吧", w / 2, h / 2);
      return;
    }
    const pad = { l: 34, r: 14, t: 16, b: 22 };
    const vals = points.map(p => p.v);
    let min = Math.min(...vals), max = Math.max(...vals);
    if (min === max) { min -= 1; max += 1; }
    const X = i => pad.l + (i / Math.max(points.length - 1, 1)) * (w - pad.l - pad.r);
    const Y = v => pad.t + (1 - (v - min) / (max - min)) * (h - pad.t - pad.b);
    ctx.strokeStyle = "rgba(147,197,253,.25)"; ctx.lineWidth = 1;
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--text-3");
    ctx.font = "10px sans-serif"; ctx.textAlign = "right";
    for (let i = 0; i <= 3; i++) {
      const v = min + (max - min) * i / 3, y = Y(v);
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
      ctx.fillText(v.toFixed(1), pad.l - 5, y + 3);
    }
    const grad = ctx.createLinearGradient(0, pad.t, 0, h - pad.b);
    grad.addColorStop(0, "rgba(96,165,250,.35)"); grad.addColorStop(1, "rgba(96,165,250,0)");
    ctx.beginPath();
    points.forEach((p, i) => i ? ctx.lineTo(X(i), Y(p.v)) : ctx.moveTo(X(i), Y(p.v)));
    ctx.lineTo(X(points.length - 1), h - pad.b); ctx.lineTo(X(0), h - pad.b); ctx.closePath();
    ctx.fillStyle = grad; ctx.fill();
    ctx.beginPath();
    points.forEach((p, i) => i ? ctx.lineTo(X(i), Y(p.v)) : ctx.moveTo(X(i), Y(p.v)));
    ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.lineJoin = "round"; ctx.stroke();
    points.forEach((p, i) => {
      ctx.beginPath(); ctx.arc(X(i), Y(p.v), 3.5, 0, Math.PI * 2);
      ctx.fillStyle = "#fff"; ctx.fill(); ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
    });
    const last = points[points.length - 1];
    ctx.fillStyle = color; ctx.font = "bold 12px sans-serif"; ctx.textAlign = "center";
    ctx.fillText(`${last.v}`, X(points.length - 1), Y(last.v) - 9);
  }
  function drawBarChart(canvas, items) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = 170;
    if (!w) return;
    canvas.width = w * dpr; canvas.height = h * dpr;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    const pad = { l: 30, r: 8, t: 14, b: 34 };
    const max = Math.max(...items.map(i => i.v), 1);
    const bw = (w - pad.l - pad.r) / items.length * 0.62;
    const gap = (w - pad.l - pad.r) / items.length;
    items.forEach((it, i) => {
      const x = pad.l + i * gap + (gap - bw) / 2;
      const bh = (it.v / max) * (h - pad.t - pad.b);
      const y = h - pad.b - bh;
      const g = ctx.createLinearGradient(0, y, 0, y + bh);
      g.addColorStop(0, "#93c5fd"); g.addColorStop(1, "#3b82f6");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.roundRect(x, y, bw, Math.max(bh, it.v ? 2 : 0), [5, 5, 0, 0]); ctx.fill();
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--text-2");
      ctx.font = "10px sans-serif"; ctx.textAlign = "center";
      ctx.fillText(it.label, x + bw / 2, h - pad.b + 15);
      if (it.v) {
        ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--text-3");
        ctx.fillText(it.v >= 1000 ? (it.v / 1000).toFixed(1) + "k" : it.v, x + bw / 2, y - 4);
      }
    });
  }
  function renderSport() {
    const weights = Store.getWeights();
    $("#weightLatest").textContent = weights.length ? weights[weights.length - 1].kg : "--";
    if (weights.length >= 2) {
      const diff = +(weights[weights.length - 1].kg - weights[0].kg).toFixed(1);
      $("#weightDelta").textContent = `较首次 ${diff > 0 ? "↑" : "↓"} ${Math.abs(diff)} kg`;
      $("#weightDelta").className = "weight-delta " + (diff > 0 ? "up" : "down");
    } else $("#weightDelta").textContent = "";
    drawLineChart($("#weightChart"), weights.slice(-30).map(w => ({ v: w.kg })));

    const tasks = Store.getSportTasks();
    $("#sportList").innerHTML = tasks.length ? tasks.map(t => `
      <div class="task-item ${t.done ? "done" : ""}">
        <button class="task-check" data-sport="${t.id}">${t.done ? "✓" : ""}</button>
        <span class="task-text">${esc(t.text)}</span>
        <button class="task-del" data-delsport="${t.id}">🗑</button>
      </div>`).join("") : `<div class="empty">添加今日运动任务，如「步行 6000 步」「帕梅拉 15 分钟」</div>`;
  }
  $("#addWeightBtn").onclick = () => promptModal("记录体重（kg）", "如：52.5", v => {
    if (isNaN(Number(v))) { toast("请输入数字"); return false; }
    Store.addWeight(v); renderSport(); toast("体重已记录 ⚖️");
  }, "number");
  $("#addSportBtn").onclick = () => promptModal("添加运动任务", "如：跑步 3 公里", v => { Store.addSportTask(v); renderSport(); });
  $("#sportList").addEventListener("click", e => {
    const ck = e.target.closest("[data-sport]");
    const dl = e.target.closest("[data-delsport]");
    if (ck) { Store.toggleSportTask(ck.dataset.sport); renderSport(); }
    if (dl) { Store.delSportTask(dl.dataset.delsport); renderSport(); }
  });

  /* ========================================================
   * 记账：概览 + 截图识别 + 速记 + 明细 + 图表
   * ======================================================== */
  const CATS = {
    expense: [["🍜", "餐饮"], ["🚌", "交通"], ["🛍️", "购物"], ["🎮", "娱乐"], ["🏠", "居家"], ["📱", "通讯"], ["💊", "医疗"], ["📚", "学习"], ["💄", "美妆"], ["🏃", "运动"], ["📦", "其他"]],
    income: [["💼", "工资"], ["💻", "兼职"], ["📈", "理财"], ["🧧", "红包"], ["✨", "其他"]],
  };
  const CAT_NAMES = new Set([].concat(CATS.expense.map(c => c[1]), CATS.income.map(c => c[1])));
  let billType = "expense", billCat = "餐饮";
  function renderCatPicker() {
    $("#catPicker").innerHTML = CATS[billType].map(([icon, name]) =>
      `<button class="cat-opt ${billCat === name ? "active" : ""}" data-cat="${name}">${icon} ${name}</button>`).join("");
  }
  document.addEventListener("click", e => {
    const b = e.target.closest(".seg-btn[data-type]");
    if (!b) return;
    $$(".seg-btn[data-type]").forEach(x => x.classList.toggle("active", x === b));
    billType = b.dataset.type; billCat = CATS[billType][0][1]; renderCatPicker();
  });
  $("#catPicker").addEventListener("click", e => {
    const c = e.target.closest("[data-cat]");
    if (!c) return;
    billCat = c.dataset.cat;
    $$(".cat-opt", $("#catPicker")).forEach(o => o.classList.toggle("active", o === c));
  });
  $("#saveBillBtn").onclick = () => {
    const amount = parseFloat($("#billAmount").value);
    if (!amount || amount <= 0) { toast("请输入金额"); return; }
    Store.addBill({ type: billType, amount: Math.round(amount * 100) / 100, cat: billCat, note: $("#billNote").value.trim() });
    $("#billAmount").value = ""; $("#billNote").value = "";
    toast("已记账 ✅");
    renderMoney(); renderHome();
  };
  const catIcon = name => (CATS.expense.concat(CATS.income)).find(c => c[1] === name)?.[0] || "💰";

  function renderMoney() {
    const now = new Date();
    $("#moneyDateSub").textContent = `${Store.today()} · 每一笔都算数`;
    const m = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const monthBills = Store.data.bills.filter(b => b.date.startsWith(m));
    const exp = monthBills.filter(b => b.type === "expense").reduce((s, b) => s + b.amount, 0);
    const inc = monthBills.filter(b => b.type === "income").reduce((s, b) => s + b.amount, 0);
    $("#ovIncome").textContent = "¥" + inc.toFixed(0);
    $("#ovExpense").textContent = "¥" + exp.toFixed(0);
    $("#ovBills").textContent = monthBills.length;

    const bills = Store.getBills();
    $("#billList").innerHTML = bills.length ? bills.slice(0, 80).map(b => `
      <div class="bill-item">
        <div class="bill-icon">${catIcon(b.cat)}</div>
        <div class="bill-info">
          <div class="bill-note">${esc(b.note || b.cat)}${b.source ? `<span class="bill-src">${esc(b.source)}</span>` : ""}</div>
          <div class="bill-meta">${b.date} ${b.time || ""} · ${b.cat}</div>
        </div>
        <div class="bill-amt ${b.type}">${b.type === "income" ? "+" : "-"}¥${b.amount.toFixed(2)}
          <button class="task-del" data-delbill="${b.id}">🗑</button>
        </div>
      </div>`).join("") : `<div class="empty">还没有记录，记下今天第一笔吧 💰</div>`;

    renderMoneyCharts();
  }
  function renderMoneyCharts() {
    const now = new Date();
    const day = now.getDay() || 7;
    const monday = new Date(now); monday.setDate(now.getDate() - day + 1);
    const mondayStr = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`;
    const weekBills = Store.data.bills.filter(b => b.type === "expense" && b.date >= mondayStr);
    const byCat = {};
    weekBills.forEach(b => byCat[b.cat] = (byCat[b.cat] || 0) + b.amount);
    const weekItems = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 7).map(([k, v]) => ({ label: k, v: Math.round(v) }));
    while (weekItems.length < 7) weekItems.push({ label: "-", v: 0 });
    drawBarChart($("#weekChart"), weekItems);

    const days = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now); d.setDate(now.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const v = Store.data.bills.filter(b => b.type === "expense" && b.date === key).reduce((s, b) => s + b.amount, 0);
      days.push({ label: i % 5 === 0 ? `${d.getMonth() + 1}/${d.getDate()}` : "", v: Math.round(v) });
    }
    drawBarChart($("#monthChart"), days);
  }
  $("#billList").addEventListener("click", e => {
    const dl = e.target.closest("[data-delbill]");
    if (dl) { Store.delBill(dl.dataset.delbill); renderMoney(); renderHome(); }
  });

  /* ---------- 账单截图识别 ---------- */
  function downscaleImage(file, maxSize = 1280) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  async function handleBillFile(file) {
    if (!AI.ready()) { toast("请先在「设置」配置豆包 API Key（视觉模型）"); go("settings"); return; }
    modal({ title: "📷 账单识别中…", body: `<div class="loading-skeleton"></div><div class="hint">正在上传截图给豆包视觉 AI 识别，请稍候（账单越清晰识别越准）…</div>`, hideActions: true });
    let dataUrl;
    try { dataUrl = await downscaleImage(file); }
    catch (e) { closeModal(); toast("图片读取失败"); return; }
    let bills;
    try { bills = await AI.recognizeBills(dataUrl); }
    catch (e) { closeModal(); toast(e.message); return; }
    if (!bills.length) { closeModal(); toast("没有识别到账单记录，请换一张更清晰的截图"); return; }
    showScanPreview(bills);
  }

  function showScanPreview(bills) {
    // 归一化
    bills = bills.map(b => ({
      type: b.type === "income" ? "income" : "expense",
      amount: Math.round(Number(b.amount) * 100) / 100,
      cat: CAT_NAMES.has(b.cat) ? b.cat : "其他",
      note: b.note || b.cat || "账单",
      date: b.date || "",
      time: b.time || "",
      source: b.source || "截图识别",
      pick: true,
    })).filter(b => b.amount > 0);

    const renderRows = () => {
      const exp = bills.filter(b => b.pick && b.type === "expense").reduce((s, b) => s + b.amount, 0);
      const inc = bills.filter(b => b.pick && b.type === "income").reduce((s, b) => s + b.amount, 0);
      const n = bills.filter(b => b.pick).length;
      // 分类小计
      const sub = {};
      bills.filter(b => b.pick).forEach(b => sub[b.cat] = (sub[b.cat] || 0) + b.amount);
      const subHtml = Object.entries(sub).sort((a, c) => c[1] - a[1])
        .map(([k, v]) => `<span class="word-book-tag">${catIcon(k)} ${k} ¥${v.toFixed(0)}</span>`).join(" ");
      $("#scanSummary").innerHTML = `
        <div class="ss-cell"><b>${n}</b><small>笔数</small></div>
        <div class="ss-cell"><b style="color:var(--danger)">¥${exp.toFixed(0)}</b><small>支出</small></div>
        <div class="ss-cell"><b style="color:var(--green)">¥${inc.toFixed(0)}</b><small>收入</small></div>`;
      $("#scanSubcats").innerHTML = subHtml;
      $("#modalOk").textContent = `✅ 导入选中的 ${n} 笔`;
      $("#scanRows").innerHTML = bills.map((b, i) => `
        <label class="scan-row">
          <input type="checkbox" class="scan-check" data-i="${i}" ${b.pick ? "checked" : ""} />
          <div class="scan-info">
            <div class="scan-note">${catIcon(b.cat)} ${esc(b.note)}</div>
            <div class="scan-meta">${esc(b.cat)} · ${esc(b.source)}${b.date ? " · " + b.date : ""}${b.time ? " " + b.time : ""}</div>
          </div>
          <div class="scan-amt ${b.type}">${b.type === "income" ? "+" : "-"}¥${b.amount.toFixed(2)}</div>
        </label>`).join("");
      $$(".scan-check").forEach(cb => cb.onchange = () => { bills[Number(cb.dataset.i)].pick = cb.checked; renderRows(); });
    };

    modal({
      title: `📷 识别到 ${bills.length} 笔账单`,
      body: `
        <div class="scan-summary" id="scanSummary"></div>
        <div style="margin-bottom:10px;line-height:2">${'<div id="scanSubcats"></div>'}</div>
        <div id="scanRows"></div>
        <div class="hint">✓ 勾选要导入的记录；金额/分类以识别结果为准，可在导入后于明细中删除。无日期的记录会计入今天。</div>`,
      okText: "✅ 导入选中",
      cancelText: "取消",
      onOk() {
        const picked = bills.filter(b => b.pick).map(({ pick, ...rest }) => rest);
        const n = Store.importBills(picked);
        toast(`已导入 ${n} 笔账单 🎉`);
        renderMoney(); renderHome();
      },
    });
    // 渲染行与汇总（renderRows 内会刷新「导入选中 N 笔」按钮文案）
    renderRows();
  }

  $("#scanBillBtn").onclick = () => $("#billFile").click();
  $("#billFile").onchange = e => {
    const f = e.target.files[0];
    if (f) handleBillFile(f);
    e.target.value = "";
  };

  /* ========================================================
   * 工作复盘
   * ======================================================== */
  let mood = "";
  $("#emojiPicker").addEventListener("click", e => {
    const b = e.target.closest("button[data-emoji]");
    if (!b) return;
    mood = b.dataset.emoji;
    $$("#emojiPicker button").forEach(x => x.classList.toggle("active", x === b));
  });
  function loadReviewToday() {
    const r = Store.getReview();
    if (!r) return;
    $("#rvProgress").value = r.progress || "";
    $("#rvDistract").value = r.distract || "";
    $("#rvKeep").value = r.keep || "";
    $("#rvImprove").value = r.improve || "";
    $("#rvRoot").value = r.root || "";
    $("#rvInsight").value = r.insight || "";
    $("#rvMoodReason").value = r.moodReason || "";
    $("#rvBig").value = r.big || "";
    $("#rvFix").value = r.fix || "";
    $("#rvHabit").value = r.habit || "";
    mood = r.mood || "";
    $$("#emojiPicker button").forEach(x => x.classList.toggle("active", x.dataset.emoji === mood));
  }
  const collectReview = () => ({
    progress: $("#rvProgress").value, distract: $("#rvDistract").value,
    keep: $("#rvKeep").value, improve: $("#rvImprove").value, root: $("#rvRoot").value,
    insight: $("#rvInsight").value, mood, moodReason: $("#rvMoodReason").value,
    big: $("#rvBig").value, fix: $("#rvFix").value, habit: $("#rvHabit").value,
  });
  $("#saveReviewBtn").onclick = () => {
    const r = collectReview();
    if (!r.keep && !r.insight && !r.big) { toast("至少写一点再保存吧 🙂"); return; }
    Store.saveReview(r);
    toast("今日复盘已保存 📝");
    renderReviewHistory();
  };
  $("#aiReviewBtn").onclick = async () => {
    if (!AI.ready()) { toast("请先在「设置」配置 API Key"); return; }
    const r = collectReview();
    const text = `今日复盘：核心任务完成度 ${r.progress || "?"}%；最大干扰源：${r.distract || "无"}；
做得好：${r.keep || "未填"}；需改进：${r.improve || "未填"}；根本原因：${r.root || "未填"}；
洞见：${r.insight || "未填"}；情绪：${r.mood || "未填"}（${r.moodReason || ""}）；
明日大事：${r.big || "未填"}；明日优化：${r.fix || "未填"}；明早微习惯：${r.habit || "未填"}。`;
    toast("AI 教练正在阅读你的复盘…");
    try {
      const reply = await AI.polishReview(text);
      modal({ title: "🤖 AI 教练点评", body: `<div style="line-height:1.9;font-size:14.5px;white-space:pre-wrap">${esc(reply)}</div>`, okText: "收到！" });
    } catch (e) { toast(e.message || "AI 请求失败"); }
  };
  function renderReviewHistory() {
    const list = Store.getReviews();
    $("#reviewHistory").innerHTML = list.length ? list.map(([date, r]) => `
      <div class="card review-history-item">
        <div class="review-h-date">📅 ${date} ${r.savedAt ? "· " + r.savedAt : ""}</div>
        ${r.mood ? `<span class="review-h-mood">${esc(r.mood)}</span>` : ""}
        <div class="review-h-line"><b>完成度</b>：${esc(r.progress || "-")}%　<b>干扰源</b>：${esc(r.distract || "-")}</div>
        ${r.keep ? `<div class="review-h-line">✅ Keep：${esc(r.keep)}</div>` : ""}
        ${r.improve ? `<div class="review-h-line">🔧 Improve：${esc(r.improve)}</div>` : ""}
        ${r.insight ? `<div class="review-h-line">💡 洞见：${esc(r.insight)}</div>` : ""}
        ${r.big ? `<div class="review-h-line">🔺 明日大事：${esc(r.big)}</div>` : ""}
        ${r.habit ? `<div class="review-h-line">🌱 微习惯：${esc(r.habit)}</div>` : ""}
      </div>`).join("") : `<div class="empty">还没有复盘记录，今晚花 5 分钟写一份吧 🌙</div>`;
  }

  /* ========================================================
   * 设置
   * ======================================================== */
  function loadSettings() {
    const s = Store.getSettings();
    $("#cfgApiKey").value = s.apiKey || "";
    $("#cfgModel").value = s.model || "doubao-seed-1-6-flash-250715";
    $("#cfgVisionModel").value = s.visionModel || "doubao-seed-1-6-250615";
  }
  $("#saveCfgBtn").onclick = async () => {
    Store.saveSettings({
      apiKey: $("#cfgApiKey").value.trim(),
      model: $("#cfgModel").value.trim() || "doubao-seed-1-6-flash-250715",
      visionModel: $("#cfgVisionModel").value.trim() || "doubao-seed-1-6-250615",
    });
    toast("已保存，正在测试连接…");
    try {
      await AI.ask("回复「连接成功」四个字即可。");
      toast("🎉 豆包 AI 连接成功！");
      $("#cfgHint").textContent = "✅ 已连接。每日内容与账单截图识别均可使用。";
      renderHome();
    } catch (e) {
      toast("连接失败：" + e.message);
      $("#cfgHint").textContent = "❌ " + e.message + "。请检查 Key 与模型 ID（方舟控制台需开通对应模型）。";
    }
  };
  $("#exportBtn").onclick = () => {
    const blob = new Blob([Store.exportAll()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `workbuddy-backup-${Store.today()}.json`;
    a.click();
    toast("备份已导出");
  };
  $("#importBtn").onclick = () => $("#importFile").click();
  $("#importFile").onchange = e => {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try { Store.importAll(reader.result); toast("导入成功，刷新页面…"); setTimeout(() => location.reload(), 800); }
      catch (err) { toast("文件格式错误"); }
    };
    reader.readAsText(f);
  };
  $("#clearCacheBtn").onclick = () => { Store.clearAiCache(); toast("已清除今日 AI 缓存，重进页面即可重新生成"); };

  /* ---------- 悬浮刷新 ---------- */
  $("#refreshBtn").onclick = () => {
    Store.clearAiCache();
    toast("正在刷新今日内容…");
    const active = $(".page.active").dataset.page;
    (renders[active] || (() => {}))();
  };

  /* ---------- 渲染注册表 ---------- */
  const renders = {
    home: () => { renderHome(); ensureClockQuote(); },
    study: () => { renderStudyStats(); renderPomo(); renderTasks(); },
    speak: () => { ensureEnglish(); ensureSpeakSentences(); ensureQuote(); },
    words: () => ensureWords(),
    news: () => ensureNews(newsState.cat),
    style: () => {
      // 同步 seg 高亮
      const active = Store.getAiCache("style_makeup") ? null : null;
      ensureStyle($$(".seg-btn[data-style].active")[0]?.dataset.style || "makeup");
    },
    sport: renderSport,
    money: renderMoney,
    review: () => { loadReviewToday(); renderReviewHistory(); },
    settings: loadSettings,
  };

  /* ---------- 启动 ---------- */
  renderCatPicker();
  renderHome();
  ensureClockQuote();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
})();
