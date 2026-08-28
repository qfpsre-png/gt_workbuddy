/* ============ WorkBuddy AI 层：火山方舟（豆包）API 封装 ============
 * 文档：https://www.volcengine.com/docs/82379 （方舟 Chat Completions，OpenAI 兼容）
 * Endpoint（可在设置中切换）：
 *   标准方舟：https://ark.cn-beijing.volces.com/api/v3
 *   Code Plan 套餐：https://ark.cn-beijing.volces.com/api/coding/v3
 * Key 仅存于本机 localStorage。
 */
const AI = (() => {
  const DEFAULT_BASE = "https://ark.cn-beijing.volces.com/api/coding/v3";
  /** 根据设置拼出 chat/completions 地址（容忍用户多填/少填尾部斜杠） */
  const endpoint = () => {
    let base = (cfg().baseUrl || DEFAULT_BASE).trim().replace(/\/+$/, "");
    if (/\/chat\/completions$/.test(base)) return base;
    return base + "/chat/completions";
  };

  const cfg = () => Store.getSettings();
  const ready = () => !!cfg().apiKey;

  /** 底层调用：messages -> 文本 */
  async function chat(messages, { json = false, temperature = 0.8, model } = {}) {
    const { apiKey, model: cfgModel } = cfg();
    if (!apiKey) throw new Error("未配置 API Key");
    const body = {
      model: model || cfgModel,
      messages,
      temperature,
    };
    if (json) body.response_format = { type: "json_object" };
    const res = await fetch(endpoint(), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`API 错误 ${res.status}：${txt.slice(0, 200)}`);
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content || "";
  }

  /** 要求 JSON 输出并解析（带容错） */
  async function chatJSON(sys, user, temperature = 0.8) {
    const raw = await chat(
      [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
      { json: true, temperature }
    );
    try {
      return JSON.parse(raw.replace(/^```json|```$/g, "").trim());
    } catch (e) {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) return JSON.parse(m[0]);
      throw new Error("AI 返回格式异常，请重试");
    }
  }

  /* ---------------- 各业务生成器 ---------------- */

  /** 每日英文短文：故事/时事/演讲，分句 + 中文翻译 */
  async function genEnglishArticle() {
    const sys = `你是一位资深英语学习内容编辑，为中国英语学习者编写"每日英语晨读"。
输出严格 JSON：{"title":"英文标题","type":"Story/News/Speech 之一","level":"难度如 B1","paragraphs":[{"en":"英文段落，用正常标点","zh":"该段中文翻译"}],"vocab":[{"word":"单词","meaning":"中文释义"}]}
要求：1) 全文 120-180 英文词，2-3 段；2) 内容积极向上，可改编真实时事/经典演讲片段/温暖故事，不要编造具体虚假新闻数据；3) 语言地道、适合跟读；4) 只输出 JSON。`;
    const kinds = ["一个温暖的短篇故事", "一段近期真实的国际时事概述（泛述即可）", "一段经典名人演讲的精华改编"];
    const kind = kinds[new Date().getDate() % 3];
    return chatJSON(sys, `请生成今天的晨读内容，主题方向：${kind}。今天日期 ${Store.today()}。`);
  }

  /** 每日中文鸡汤 */
  async function genZhQuote() {
    const sys = `你是一位温暖的中文写作者，每天送用户一句有力量的话。
输出严格 JSON：{"quote":"一句中文励志金句（20-40字，可引用名家或原创，若引用请注明）","from":"出处/作者，原创则写'原创'","note":"一段 60-100 字的温柔解读，告诉用户今天可以怎么做"}
只输出 JSON。`;
    return chatJSON(sys, `今天是 ${Store.today()}，请写一句鼓舞人心的话。`);
  }

  /** 每日 30 单词 */
  async function genDailyWords() {
    const queue = Store.getReviewQueue();
    const queueInfo = queue.length
      ? `其中必须优先包含这些用户标记"复习"的单词（沿用其 word/phonetic/meaning/sentence 等字段并补充 emoji）：${queue.map(w => w.word).join(", ")}；`
      : "";
    const sys = `你是一位英语词汇老师，为中国学习者挑选"每日 30 词"。
输出严格 JSON：{"words":[{"word":"英文单词","phonetic":"音标如 /əˈbændən/","meaning":"中文释义（词性+意思）","sentence":"地道英文例句","sentenceZh":"例句中文翻译","emoji":"一个最能表达该词含义的 emoji（1个）"}]}
要求：1) 恰好 30 个；2) 覆盖日常高频词 + 少量进阶词（四六级/雅思难度混合）；3) ${queueInfo}4) 例句简短生活化；5) 只输出 JSON。`;
    const user = `请生成 ${Store.today()} 的 30 个单词。复习队列中有 ${queue.length} 个词需优先包含。`;
    const r = await chatJSON(sys, user, 0.9);
    return (r.words || []).slice(0, 30);
  }

  /** 每日热点（三类） */
  async function genNews(cat) {
    const conf = {
      national: {
        title: "国家大事/时政热点",
        sys: `你是一位严谨的中文新闻编辑。基于你的知识，挑选近期（知识截止日期前）中国国内 3 条最重要的国家层面热点（政策、经济、科技、民生方向均可）。
输出严格 JSON：{"items":[{"title":"标题","source":"来源类型如 新华社/人民日报（泛称即可）","content":"80-120 字概述，客观中立"}]}
要求：真实、正能量导向、不要编造具体数字与不存在的事件；如不确定时效性，选择长期重要的宏观议题（如新质生产力、人口政策等）并说明背景。只输出 JSON。`,
      },
      robot: {
        title: "机器人/具身智能/自动驾驶",
        sys: `你是一位科技产业分析师。挑选 3 条近期机器人、具身智能、人形机器人、自动驾驶领域的热点（公司动态、技术突破、股票/融资事件均可，可涉及特斯拉Optimus、宇树、Figure、Waymo、比亚迪智驾、小鹏等）。
输出严格 JSON：{"items":[{"title":"标题","source":"来源泛称","content":"80-120 字概述，含对相关公司/行业的影响"}]}
要求：客观，不编造未发生的融资/股价数字；趋势性内容请标注为"行业观察"。只输出 JSON。`,
      },
      psych: {
        title: "心理/社会工作/个人成长",
        sys: `你是一位心理咨询行业观察者。挑选 3 条与心理健康、社会工作行业动态、个人成长相关的内容（如青少年心理、职场倦怠、情绪调节研究、社工政策等）。
输出严格 JSON：{"items":[{"title":"标题","source":"来源泛称","content":"80-120 字概述 + 一条对个人的实用建议"}]}
要求：温暖、科学、不制造焦虑。只输出 JSON。`,
      },
    }[cat];
    return chatJSON(conf.sys, `今天是 ${Store.today()}，请生成今日「${conf.title}」3 条。`);
  }

  /** 妆容 / 穿搭 */
  async function genStyle(kind) {
    if (kind === "makeup") {
      const sys = `你是一位专业美妆博主。每天给用户推荐一个"日常通勤妆容教程"。
输出严格 JSON：{"title":"妆容名称","emoji":"代表 emoji","look":"风格描述 1 句","steps":["步骤1（含产品类型+手法）","步骤2...共 6-8 步"],"tip":"一条小贴士","videoKeyword":"适合在 B站/小红书/YouTube 搜索该教程视频的关键词（中文）"}
要求：步骤具体可操作、适合新手、日常淡雅。只输出 JSON。`;
      return chatJSON(sys, `生成今天的日常妆容教程。`);
    }
    const month = new Date().getMonth() + 1;
    const season = month >= 3 && month <= 5 ? "春" : month >= 6 && month <= 8 ? "夏" : month >= 9 && month <= 11 ? "秋" : "冬";
    const sys = `你是一位穿搭博主。根据当前季节给用户推荐一套日常穿搭。
输出严格 JSON：{"title":"穿搭名称","emoji":"代表 emoji","season":"季节","pieces":["单品1（颜色+款式）","单品2...共 5-6 件"],"style":"搭配思路 2-3 句","tip":"一条避坑/加分小贴士","videoKeyword":"适合在 B站/小红书 搜索穿搭视频的关键词"}
要求：适合普通身材、通勤/日常、预算友好；注明配色逻辑。只输出 JSON。`;
    return chatJSON(sys, `现在是${season}季（${month}月），请推荐今日穿搭。`);
  }

  /** 账单截图识别（视觉模型）：图片 base64 -> 结构化账单数组 */
  async function recognizeBills(dataUrl) {
    const { apiKey, visionModel } = cfg();
    if (!apiKey) throw new Error("未配置 API Key");
    const sys = `你是一个账单识别助手。用户上传支付宝/微信/美团/银行账单的截图，请逐条识别交易记录。
输出严格 JSON：{"bills":[{"type":"expense 或 income","amount":数字金额(元,不含¥符号),"cat":"分类","note":"商户/备注摘要(简短)","date":"YYYY-MM-DD","time":"HH:MM","source":"支付宝/微信/美团/银行"}],"total":总条数}
分类只能从以下选一个：餐饮、交通、购物、娱乐、居家、医疗、学习、美妆、运动、通讯、工资、兼职、理财、红包、其他。
日期规则：截图中能看到具体日期就照填；只显示"今天/昨天"或无日期则留空字符串。收入（退款/收款/工资/红包）type 填 income。
若截图不是账单或无法识别任何记录，返回 {"bills":[],"total":0}。只输出 JSON。`;
    const body = {
      model: visionModel || "doubao-seed-1-6-250615",
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [{
        role: "user",
        content: [
          { type: "text", text: sys },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      }],
    };
    const res = await fetch(endpoint(), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`视觉识别失败（${res.status}）：请确认在方舟控制台开通了视觉模型「${body.model}」，或在设置中更换模型 ID。${txt.slice(0, 120)}`);
    }
    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content || "{}";
    let parsed;
    try { parsed = JSON.parse(raw); }
    catch (e) { const m = raw.match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : { bills: [] }; }
    return parsed.bills || [];
  }

  /** 每日口语练习句 */
  async function genSpeakSentences() {
    const sys = `你是英语口语教练，每天给用户 4 个"当日口语句"（覆盖表达观点/职场/社交/自我激励）。
输出严格 JSON：{"sentences":[{"en":"英文句子（地道、简短、适合跟读）","zh":"中文翻译","scene":"场景标签如 表达观点/职场沟通/日常社交/自我激励"}]}
要求：每句不超过 14 个词，适合 B1-B2 水平，实用可立刻用。只输出 JSON。`;
    const r = await chatJSON(sys, `今天是 ${Store.today()}，请生成 4 个口语练习句。`, 0.9);
    return r.sentences || [];
  }

  /** AI 润色复盘 */
  async function polishReview(text) {
    const sys = `你是一位温柔而犀利的个人成长教练。用户发来今天的工作复盘（可能比较粗糙），请：1) 用 2-3 句话肯定做得好的地方；2) 指出 1-2 个关键改进点；3) 把"明日铁三角"优化得更具体可执行。语气鼓励、不说教。150-220 字。直接输出正文，不要 JSON。`;
    return chat([{ role: "system", content: sys }, { role: "user", content: text }], { temperature: 0.7 });
  }

  /** 通用助理（预留） */
  async function ask(q) {
    return chat([
      { role: "system", content: "你是 WorkBuddy 工作台里的豆包 AI 助理，简洁、实用、温暖地回答用户。" },
      { role: "user", content: q },
    ]);
  }

  /* ---------------- 离线兜底（未配置 Key / 网络失败时展示） ---------------- */
  const fallback = {
    english() {
      return {
        title: "The Power of Small Steps",
        type: "Story", level: "B1",
        paragraphs: [
          { en: "Every morning, Maya wrote down one small thing she wanted to finish before noon. It was never anything grand — just a single email, ten pages of reading, or a short walk.", zh: "每天早上，玛雅都会写下一件她想在中午前完成的小事。从来不是什么宏大的事——只是一封邮件、十页书，或者一小段散步。" },
          { en: "At first, nothing seemed to change. But after a year, she had finished a book, rebuilt her health, and quietly changed careers. Big results, she realized, are just small steps repeated daily.", zh: "起初似乎什么都没改变。但一年后，她读完了一本书、恢复了健康，还悄悄换了职业。她意识到，伟大的结果不过是每天重复的小小一步。" },
        ],
        vocab: [{ word: "grand", meaning: "adj. 宏大的，宏伟的" }, { word: "repeat", meaning: "v. 重复" }],
        _offline: true,
      };
    },
    quote() {
      return { quote: "你不必看到整个楼梯，只需迈出第一步。", from: "马丁·路德·金", note: "今天不用想清楚全年的规划，先把手头这一件小事做完。行动本身，就会带来下一步的 clarity。", _offline: true };
    },
    words() {
      const sample = [
        ["diligent", "/ˈdɪlɪdʒənt/", "adj. 勤奋的", "She is diligent about her morning studies.", "她每天早晨都勤奋学习。", "💪"],
        ["curious", "/ˈkjʊəriəs/", "adj. 好奇的", "Stay curious and keep asking questions.", "保持好奇，不断提问。", "🤔"],
        ["gentle", "/ˈdʒentl/", "adj. 温柔的；轻柔的", "Be gentle with yourself on hard days.", "在艰难的日子里，对自己温柔一点。", "🫧"],
      ];
      return sample.map(([word, phonetic, meaning, sentence, sentenceZh, emoji]) =>
        ({ word, phonetic, meaning, sentence, sentenceZh, emoji, _offline: true }));
    },
    news(cat) {
      const bank = {
        national: [
          { title: "（示例）新质生产力持续推进，高技术制造业快速增长", source: "行业观察", content: "各地持续培育人工智能、生物医药、新能源等新兴产业，高端制造与数字经济成为就业与投资的重要方向。对个人而言，关注相关技能学习是长期红利。" },
          { title: "（示例）促消费政策延续，服务消费活力增强", source: "行业观察", content: "文旅、体育、健康等服务消费持续升温，周末经济与夜间经济活跃。记账时可留意自己的消费结构是否向体验型消费倾斜。" },
          { title: "（示例）民生保障网不断织密", source: "行业观察", content: "医保、养老、住房等民生政策持续优化。建议每年核对一次社保与公积金缴纳情况，做好家庭保障台账。" },
        ],
        robot: [
          { title: "（示例）人形机器人进入量产元年", source: "行业观察", content: "特斯拉 Optimus、宇树、Figure 等公司加速量产试点，零部件国产化降本明显。关注伺服电机、减速器、传感器产业链相关公司。" },
          { title: "（示例）城市 NOA 智驾竞争加剧", source: "行业观察", content: "华为、小鹏、比亚迪等城市领航辅助驾驶开城速度加快，端到端大模型成为技术主线。安全性数据与订阅率是估值关键。" },
          { title: "（示例）具身智能大模型加速融合", source: "行业观察", content: "VLA（视觉-语言-动作）模型让机器人泛化能力提升，数据采集与仿真平台成为创业热点。" },
        ],
        psych: [
          { title: "（示例）「情绪粒度」越高，心理越健康", source: "心理学科普", content: "研究发现，能精细描述情绪（如「焦灼」「失落」「期待」）的人，调节情绪更快。建议：今天复盘时给情绪一个更精确的词。" },
          { title: "（示例）职场倦怠的早期信号", source: "行业观察", content: "周日晚失眠、对小事易怒、成就感下降都是倦怠前兆。实用建议：每天安排一件「完全为自己」的微休息。" },
          { title: "（示例）社工站覆盖持续扩大", source: "政策动态", content: "基层社工站在社区心理服务、老年关怀中作用增强，遇到心理困扰可主动联系社区免费咨询资源。" },
        ],
      };
      return { items: bank[cat].map(i => ({ ...i, _offline: true })) };
    },
    style(kind) {
      if (kind === "makeup") return {
        title: "5 分钟清透通勤妆", emoji: "💄", look: "干净、好气色、零妆感",
        steps: ["妆前：保湿乳后涂一层轻薄隔离，T 区重点控油", "底妆：气垫轻拍全脸，瑕疵处用遮瑕点涂", "定妆：透明散粉只压 T 区，保留脸颊光泽", "眉眼：眉粉填空隙，大地色眼影大面积扫眼皮", "眼线：棕色胶笔填睫毛根部，眼尾平拉 3mm", "腮红：奶杏色打在苹果肌斜上方，提气色", "口红：豆沙色薄涂，手指晕开边缘"],
        tip: "新手底妆宁可少不可多，「脖子和脸无色差」比「白」更重要。",
        videoKeyword: "5分钟通勤妆 新手日常妆容教程", _offline: true,
      };
      const month = new Date().getMonth() + 1;
      const season = month >= 3 && month <= 5 ? "春" : month >= 6 && month <= 8 ? "夏" : month >= 9 && month <= 11 ? "秋" : "冬";
      const looks = {
        春: ["奶白针织开衫 + 浅蓝色直筒牛仔裤 + 白色德训鞋", "燕麦色风衣 + 白 T + 卡其半裙 + 乐福鞋"],
        夏: ["浅蓝色条纹衬衫（当薄外套）+ 白色背心 + 卡其短裤 + 帆布鞋", "雾霾蓝连衣裙 + 草编包 + 白色凉鞋"],
        秋: ["藏青西装外套 + 白T + 烟管裤 + 小皮鞋", "焦糖色针织衫 + 米白阔腿裤 + 短靴"],
        冬: ["雾霾蓝羽绒服 + 灰色高领毛衣 + 黑色直筒裤 + 雪地靴", "驼色大衣 + 白色针织内搭 + 深蓝牛仔裤 + 踝靴"],
      };
      return {
        title: `${season}季·蓝白系清爽通勤穿搭`, emoji: "👗", season,
        pieces: looks[season][0].split(" + ").concat(["同色系帆布包/托特包", "简约银色小耳钉"]),
        style: "以蓝+白+卡其为核心配色，同色系深浅叠穿显高显瘦；上宽下直的廓形对各种身材都友好，通勤休闲两用。",
        tip: "全身主色不超过 3 个；亮色只出现在配饰（包/口红）上。",
        videoKeyword: `${season}季通勤穿搭 微胖 显高 蓝白配色`, _offline: true,
      };
    },
    speakSentences() {
      return [
        { en: "I believe that consistent effort outweighs raw talent.", zh: "我相信持续的努力胜过天赋。", scene: "自我激励" },
        { en: "Could you elaborate on that point?", zh: "你能详细说说那一点吗？", scene: "职场沟通" },
        { en: "I see things a little differently.", zh: "我的看法略有不同。", scene: "表达观点" },
        { en: "Thank you for having me, it's great to be here.", zh: "谢谢邀请，很高兴来到这里。", scene: "日常社交" },
      ].map(s => ({ ...s, _offline: true }));
    },
  };

  return { ready, chat, genEnglishArticle, genZhQuote, genDailyWords, genNews, genStyle, polishReview, ask, recognizeBills, genSpeakSentences, fallback };
})();
