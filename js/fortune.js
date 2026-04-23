/**
 * fortune.js — 運勢內容隨機生成器
 * 產生天氣預測、今日運勢、幸運顏色
 */

const FortuneGenerator = (() => {
  // ========== 天氣預測資料 ==========
  const weathers = [
    { name: '大晴天', icon: '☀️', desc: '萬里無雲，適合出門走走' },
    { name: '晴朗微風', icon: '🌤️', desc: '微風徐徐，心情也跟著好起來' },
    { name: '多雲時晴', icon: '⛅', desc: '雲層遮陽但不擋好運' },
    { name: '陣雨轉晴', icon: '🌦️', desc: '雨後天晴，否極泰來' },
    { name: '雷陣雨', icon: '⛈️', desc: '電閃雷鳴，宜靜心養氣' },
    { name: '細雨綿綿', icon: '🌧️', desc: '綿綿細雨洗滌心靈' },
    { name: '大雨滂沱', icon: '🌊', desc: '暴雨如注，宜守不宜攻' },
    { name: '薄霧瀰漫', icon: '🌫️', desc: '霧裡看花，靜待撥雲見日' },
    { name: '暴風將至', icon: '🌪️', desc: '風雨欲來，做好萬全準備' },
    { name: '飄雪紛飛', icon: '❄️', desc: '銀白世界，浪漫而寧靜' },
    { name: '彩虹乍現', icon: '🌈', desc: '難得一見的好兆頭' },
    { name: '星空燦爛', icon: '✨', desc: '夜空清澈，適合許願' },
  ];

  // ========== 運勢等級 ==========
  const fortuneLevels = [
    {
      level: '大吉',
      color: '#FFD700',
      messages: [
        '今日運勢如虹，萬事皆宜，勇敢追夢吧！',
        '貴人相助，財運亨通，把握每一個機會。',
        '天時地利人和，今天是你的幸運日！',
        '所有的努力都將獲得回報，盡情綻放吧。',
      ],
    },
    {
      level: '中吉',
      color: '#FFA500',
      messages: [
        '穩步前進的一天，適合推動重要計畫。',
        '人際關係良好，多與朋友交流會有意外收穫。',
        '工作順利，但記得適時休息充電。',
        '今天的小小堅持，會成為未來的大大回報。',
      ],
    },
    {
      level: '小吉',
      color: '#90EE90',
      messages: [
        '平穩中帶有小確幸，留意身邊的美好瞬間。',
        '適合學習新事物，知識就是你的幸運符。',
        '雖然不是大起大落，但每一步都紮實穩健。',
        '今天適合整理思緒，為下一步做好準備。',
      ],
    },
    {
      level: '吉',
      color: '#87CEEB',
      messages: [
        '日常中的小幸運正在醞釀，保持好心情。',
        '適合處理日常事務，一步一腳印最踏實。',
        '今天的關鍵字是「耐心」，好事不怕慢。',
        '維持平常心，機會會在不經意間降臨。',
      ],
    },
    {
      level: '末吉',
      color: '#DDA0DD',
      messages: [
        '運勢平平，但危機就是轉機，保持警覺。',
        '今天宜守不宜攻，穩紮穩打最重要。',
        '可能會遇到小挫折，但都是成長的養分。',
        '放慢腳步，反而能看見更多風景。',
      ],
    },
    {
      level: '凶',
      color: '#CD853F',
      messages: [
        '今日宜靜不宜動，凡事三思而後行。',
        '小心口舌之爭，言多必失，謹言慎行。',
        '避免衝動決定，今天不是冒險的好時機。',
        '退一步海闊天空，忍一時風平浪靜。',
      ],
    },
    {
      level: '大凶',
      color: '#8B0000',
      messages: [
        '今日諸事不宜，但風雨過後必見彩虹。',
        '低調行事，避免與人起衝突，靜待時機。',
        '最黑暗的時刻過後就是黎明，堅持住！',
        '宜閉門修養，養精蓄銳，明天會更好。',
      ],
    },
  ];

  // ========== 幸運顏色 ==========
  const luckyColors = [
    { name: '琥珀金', hex: '#FFBF00' },
    { name: '翡翠綠', hex: '#50C878' },
    { name: '寶石藍', hex: '#4169E1' },
    { name: '珊瑚紅', hex: '#FF6F61' },
    { name: '薰衣草紫', hex: '#B57EDC' },
    { name: '蜜桃粉', hex: '#FFDAB9' },
    { name: '天際青', hex: '#00CED1' },
    { name: '落日橘', hex: '#FF8C00' },
    { name: '月光銀', hex: '#C0C0C0' },
    { name: '櫻花粉', hex: '#FFB7C5' },
    { name: '森林綠', hex: '#228B22' },
    { name: '深海藍', hex: '#000080' },
    { name: '檸檬黃', hex: '#FFF44F' },
    { name: '玫瑰金', hex: '#B76E79' },
    { name: '冰川白', hex: '#F0F8FF' },
    { name: '墨玉黑', hex: '#1C1C1C' },
  ];

  // 用過的索引（避免同一 session 重複）
  let usedWeatherIndices = [];
  let usedFortuneIndices = [];
  let usedColorIndices = [];

  function getRandomIndex(arr, usedIndices) {
    if (usedIndices.length >= arr.length) {
      usedIndices.length = 0; // 全部用過就重置
    }
    let idx;
    do {
      idx = Math.floor(Math.random() * arr.length);
    } while (usedIndices.includes(idx));
    usedIndices.push(idx);
    return idx;
  }

  /**
   * 生成一組完整運勢
   */
  function generate() {
    const weatherIdx = getRandomIndex(weathers, usedWeatherIndices);
    const fortuneIdx = getRandomIndex(fortuneLevels, usedFortuneIndices);
    const colorIdx = getRandomIndex(luckyColors, usedColorIndices);

    const weather = weathers[weatherIdx];
    const fortune = fortuneLevels[fortuneIdx];
    const color = luckyColors[colorIdx];

    const messageIdx = Math.floor(Math.random() * fortune.messages.length);

    return {
      weather: {
        name: weather.name,
        icon: weather.icon,
        desc: weather.desc,
      },
      fortune: {
        level: fortune.level,
        color: fortune.color,
        message: fortune.messages[messageIdx],
      },
      luckyColor: {
        name: color.name,
        hex: color.hex,
      },
    };
  }

  /**
   * 重置使用紀錄
   */
  function reset() {
    usedWeatherIndices = [];
    usedFortuneIndices = [];
    usedColorIndices = [];
  }

  return { generate, reset };
})();
