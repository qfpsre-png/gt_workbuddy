/* ============ WorkBuddy 音频层：英文发音 + 跟读（Web Speech API，免费免Key） ============ */
const AudioKit = (() => {
  const synth = window.speechSynthesis;
  let enVoice = null;

  const pickVoice = () => {
    const voices = synth ? synth.getVoices() : [];
    enVoice =
      voices.find(v => /en[-_]US/i.test(v.lang) && /natural|neural|google/i.test(v.name)) ||
      voices.find(v => /en[-_]US/i.test(v.lang)) ||
      voices.find(v => /^en/i.test(v.lang)) ||
      null;
  };
  if (synth) {
    pickVoice();
    synth.onvoiceschanged = pickVoice;
  }

  /** 朗读英文文本；onEnd 回调 */
  function speak(text, { onEnd, rate = 0.92 } = {}) {
    if (!synth) { toast("当前浏览器不支持语音合成"); return; }
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    if (enVoice) u.voice = enVoice;
    u.rate = rate;
    u.pitch = 1;
    if (onEnd) u.onend = onEnd;
    synth.speak(u);
  }

  function stop() { if (synth) synth.cancel(); }

  /** 分句：按句号/问号/感叹号切 */
  function splitSentences(text) {
    return text.match(/[^.!?]+[.!?]+/g) || [text];
  }

  /** 跟读：调用语音识别朗读用户，返回识别文本 */
  function listenOnce({ onResult, onError } = {}) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { onError && onError("当前浏览器不支持语音识别（建议用 Chrome / 小米浏览器最新版）"); return; }
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      const said = e.results[0][0].transcript.trim().toLowerCase();
      onResult && onResult(said);
    };
    rec.onerror = (e) => onError && onError(e.error === "not-allowed" ? "请允许麦克风权限" : "识别失败，请再试一次");
    try { rec.start(); } catch (e) { onError && onError("请稍等再试"); }
    return rec;
  }

  /** 极简相似度评分：基于词集合重合率 0-100 */
  function score(target, said) {
    const norm = s => s.toLowerCase().replace(/[^a-z0-9'\s]/g, "").split(/\s+/).filter(Boolean);
    const t = norm(target), s = new Set(norm(said));
    if (!t.length) return 0;
    const hit = t.filter(w => s.has(w)).length;
    return Math.round((hit / t.length) * 100);
  }

  return { speak, stop, splitSentences, listenOnce, score };
})();
