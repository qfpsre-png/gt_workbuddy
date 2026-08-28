/* ============ WorkBuddy 数据层：localStorage 本地存储 ============ */
const Store = (() => {
  const KEY = "workbuddy_v1";

  const todayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const defaultData = () => ({
    settings: { apiKey: "", baseUrl: "", model: "doubao-seed-1-6-flash-250715", visionModel: "doubao-seed-1-6-250615", theme: "light" },
    checkins: {},            // { "2026-08-28": true }（保留，首页主打卡）
    habits: {                // 三个习惯打卡：早起 / 早睡 / 读书
      early: { icon: "🌅", name: "早起", target: "07:00", days: {} },
      sleep: { icon: "🌙", name: "早睡", target: "23:00", days: {} },
      read:  { icon: "📖", name: "读书", target: "", days: {} },
    },
    studyTasks: [],          // {id, text, done, date}
    focusMinutes: {},        // { "2026-08-28": 50 }
    wordBook: [],            // {id, word, phonetic, meaning, sentence, sentenceZh, emoji, addedAt, status: 'known'|'review'}
    wordsQueue: [],          // 待复习单词
    dailyWordsDate: "",      // 当日单词所属日期
    dailyWords: [],          // 当日 30 词
    wordIndex: 0,
    weights: [],             // {kg, date}
    sportTasks: [],          // {id, text, done, date}
    bills: [],               // {id, type:'expense'|'income', amount, cat, note, date}
    reviews: {},             // { "2026-08-28": {...} }
    aiCache: {},             // { "2026-08-28": {enArticle, zhQuote, news:{...}, makeup, outfit} }
  });

  let data = (() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return Object.assign(defaultData(), JSON.parse(raw));
    } catch (e) { console.warn("读取本地数据失败", e); }
    return defaultData();
  })();

  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify(data)); }
    catch (e) { console.warn("保存失败", e); }
  };

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  return {
    today: todayStr,
    get data() { return data; },
    save,
    uid,

    /* ---- 设置 ---- */
    getSettings: () => data.settings,
    saveSettings(patch) { Object.assign(data.settings, patch); save(); },

    /* ---- 打卡 ---- */
    isCheckedIn(date = todayStr()) { return !!data.checkins[date]; },
    toggleCheckin(date = todayStr()) {
      data.checkins[date] = !data.checkins[date];
      if (!data.checkins[date]) delete data.checkins[date];
      save();
      return !!data.checkins[date];
    },
    checkinStreak() {
      let streak = 0;
      const d = new Date();
      for (let i = 0; i < 400; i++) {
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        if (data.checkins[key]) { streak++; d.setDate(d.getDate() - 1); }
        else break;
      }
      return streak;
    },

    /* ---- 习惯打卡（早起/早睡/读书） ---- */
    getHabits: () => data.habits,
    toggleHabit(key, date = todayStr()) {
      const h = data.habits[key];
      if (!h) return false;
      h.days[date] = !h.days[date];
      if (!h.days[date]) delete h.days[date];
      save();
      return !!h.days[date];
    },
    habitDone(key, date = todayStr()) { return !!data.habits[key]?.days[date]; },
    habitStreak(key) {
      let streak = 0;
      const d = new Date();
      for (let i = 0; i < 400; i++) {
        const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        if (data.habits[key]?.days[ds]) { streak++; d.setDate(d.getDate() - 1); }
        else break;
      }
      return streak;
    },
    // 近两周（含今天，共14天，旧→新）打卡情况
    habitTwoWeeks(key) {
      const out = [];
      const d = new Date();
      d.setDate(d.getDate() - 13);
      for (let i = 0; i < 14; i++) {
        const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        out.push(!!data.habits[key]?.days[ds]);
        d.setDate(d.getDate() + 1);
      }
      return out;
    },

    /* ---- 学习任务（按天） ---- */
    getTasks(date = todayStr()) {
      return data.studyTasks.filter(t => t.date === date);
    },
    addTask(text, date = todayStr()) {
      data.studyTasks.push({ id: uid(), text, done: false, date });
      save();
    },
    toggleTask(id) {
      const t = data.studyTasks.find(t => t.id === id);
      if (t) { t.done = !t.done; save(); }
    },
    delTask(id) {
      data.studyTasks = data.studyTasks.filter(t => t.id !== id);
      save();
    },
    addFocusMinutes(min, date = todayStr()) {
      data.focusMinutes[date] = (data.focusMinutes[date] || 0) + min;
      save();
    },
    getFocusMinutes(date = todayStr()) { return data.focusMinutes[date] || 0; },

    /* ---- 单词 ---- */
    getDailyWords() { return data.dailyWordsDate === todayStr() ? data.dailyWords : []; },
    setDailyWords(words) {
      data.dailyWordsDate = todayStr();
      data.dailyWords = words;
      data.wordIndex = 0;
      save();
    },
    getWordIndex: () => data.wordIndex,
    setWordIndex(i) { data.wordIndex = i; save(); },
    markWord(word, status) {
      // status: 'known' | 'review'
      const exist = data.wordBook.find(w => w.word.toLowerCase() === word.word.toLowerCase());
      if (exist) {
        exist.status = status;
        exist.meaning = word.meaning || exist.meaning;
      } else {
        data.wordBook.unshift({ id: uid(), ...word, addedAt: todayStr(), status });
      }
      // 复习的词进入明日队列
      if (status === "review") {
        if (!data.wordsQueue.some(w => w.word.toLowerCase() === word.word.toLowerCase())) {
          data.wordsQueue.push(word);
        }
      } else {
        data.wordsQueue = data.wordsQueue.filter(w => w.word.toLowerCase() !== word.word.toLowerCase());
      }
      save();
    },
    getWordBook: () => data.wordBook,
    addWordManual(word) {
      if (!data.wordBook.some(w => w.word.toLowerCase() === word.word.toLowerCase())) {
        data.wordBook.unshift({ id: uid(), status: "known", addedAt: todayStr(), ...word });
        save();
        return true;
      }
      return false;
    },
    delWord(id) { data.wordBook = data.wordBook.filter(w => w.id !== id); save(); },
    getReviewQueue: () => data.wordsQueue,

    /* ---- 体重 / 运动 ---- */
    getWeights: () => data.weights.slice().sort((a, b) => a.date.localeCompare(b.date)),
    addWeight(kg) { data.weights.push({ kg: Number(kg), date: todayStr() + " " + new Date().toTimeString().slice(0, 5) }); save(); },
    getSportTasks(date = todayStr()) { return data.sportTasks.filter(t => t.date === date); },
    addSportTask(text, date = todayStr()) { data.sportTasks.push({ id: uid(), text, done: false, date }); save(); },
    toggleSportTask(id) { const t = data.sportTasks.find(t => t.id === id); if (t) { t.done = !t.done; save(); } },
    delSportTask(id) { data.sportTasks = data.sportTasks.filter(t => t.id !== id); save(); },

    /* ---- 记账 ---- */
    addBill(bill) { data.bills.push({ id: uid(), date: todayStr(), time: new Date().toTimeString().slice(0, 5), ...bill }); save(); },
    /** 批量导入 AI 识别的账单：items=[{type,amount,cat,note,date,time,source}]，返回导入条数 */
    importBills(items) {
      let n = 0;
      for (const it of items) {
        if (!it || !it.amount || !(it.amount > 0)) continue;
        data.bills.push({
          id: uid(),
          type: it.type === "income" ? "income" : "expense",
          amount: Math.round(Number(it.amount) * 100) / 100,
          cat: it.cat || "其他",
          note: it.note || "",
          date: it.date || todayStr(),
          time: it.time || "",
          source: it.source || "截图识别",
        });
        n++;
      }
      if (n) save();
      return n;
    },
    delBill(id) { data.bills = data.bills.filter(b => b.id !== id); save(); },
    getBills: () => data.bills.slice().reverse(),
    getBillsByDate(date) { return data.bills.filter(b => b.date === date); },

    /* ---- 复盘 ---- */
    getReview(date = todayStr()) { return data.reviews[date]; },
    saveReview(review, date = todayStr()) { data.reviews[date] = { ...review, savedAt: new Date().toTimeString().slice(0, 5) }; save(); },
    getReviews: () => Object.entries(data.reviews).sort((a, b) => b[0].localeCompare(a[0])),

    /* ---- AI 内容缓存（每日一份） ---- */
    getAiCache(key) {
      const day = data.aiCache[todayStr()];
      return day ? day[key] : null;
    },
    setAiCache(key, value) {
      if (!data.aiCache[todayStr()]) data.aiCache[todayStr()] = {};
      data.aiCache[todayStr()][key] = value;
      save();
    },
    clearAiCache() { data.aiCache = {}; save(); },

    /* ---- 导入导出 ---- */
    exportAll() { return JSON.stringify(data, null, 2); },
    importAll(json) {
      const parsed = JSON.parse(json);
      data = Object.assign(defaultData(), parsed);
      save();
    },
  };
})();
