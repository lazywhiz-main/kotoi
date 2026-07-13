/** @param {string} path @param {unknown} body */
export async function postJson(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

export async function checkHealth() {
  const res = await fetch('/api/health');
  return res.json();
}

export function getExploration(key) {
  return structuredClone(SAMPLE_EXPLORATIONS[key] ?? SAMPLE_EXPLORATIONS.work_body);
}

export const GRAPHIC_REC_SIZES = {
  '1024x1024': {
    width: 1024,
    height: 1024,
    openAiSize: '1024x1024',
    label: '1024×1024（1:1 正方形）',
    aspectW: 1,
    aspectH: 1,
  },
  '1024x1792': {
    width: 1024,
    height: 1792,
    openAiSize: '1024x1792',
    label: '1024×1792（9:16 縦）',
    aspectW: 1024,
    aspectH: 1792,
  },
};

export const GRAPHIC_REC_SIZE = GRAPHIC_REC_SIZES['1024x1024'];

export const TYPE_COLORS = {
  dig: { text: '#7a6fd4', ink: '#5c52a8', label: '深掘り' },
  con: { text: '#1d9e75', ink: '#157a5c', label: '接続' },
  ref: { text: '#d85a30', ink: '#a84424', label: '反証' },
  act: { text: '#639922', ink: '#4a7318', label: '行動' },
  exp: { text: '#378add', ink: '#2a6aab', label: '拡張' },
};

export const SAMPLE_EXPLORATIONS = {
  work_body: {
    id: 'expl-work-body',
    title: '働き方と身体の境界',
    short_label: '身体と仕事',
    synthesis:
      '「効率」と「回復」を別カテゴリに分けているのが、疲れの正体かもしれない。問いはどちらか一方への帰属ではなく、境界の引き直しに向かっている。',
    progress: 42,
    notes: [
      { id: 'n1', label: '午後の会議後は必ず頭がぼんやりする。休むより散歩の方が回復する', type: 'feeling' },
      { id: 'n2', label: 'スタンディングデスク導入したが、集中は立ちより座り。足の疲れが先に来る', type: 'seed' },
      { id: 'n3', label: 'Deep Work の時間設計 — 午前ブロック vs 午後ブロック', type: 'learn' },
    ],
    questions: [
      { id: 'q1', question_type: 'dig', body: '「回復しない疲れ」と「眠れば戻る疲れ」の境目は、いつ頃から曖昧になった？', user_thoughts: '最近は境界がなくなった気がする', note_id: 'n1' },
      { id: 'q2', question_type: 'con', body: '散歩で回復する感覚は、以前の「通勤の空白」と同型か？', user_thoughts: null, note_id: 'n1' },
      { id: 'q3', question_type: 'ref', body: '本当に「集中＝座り」か。体を動かした方が思考が続く日もあるのでは？', user_thoughts: null, note_id: 'n2' },
      { id: 'q4', question_type: 'act', body: '来週、会議の直後に15分の「身体リセット」を試すなら、何をする？', user_thoughts: '散歩かストレッチ', note_id: 'n1' },
    ],
    subthemes: [
      { label: '疲れの質', question_ids: ['q1', 'q4'] },
      { label: '身体と集中', question_ids: ['q2', 'q3'] },
    ],
  },
  child_learning: {
    id: 'expl-child',
    title: '子どもの学びと自分の焦り',
    short_label: '学びと焦り',
    synthesis:
      '子どものペースと自分の期待がずれているとき、問いは「正しい関わり方」より「焦りの源泉」に向かっている。比較ではなく、自分の物語の再確認に近い。',
    progress: 28,
    notes: [
      { id: 'n1', label: '宿題を見守るより、一緒にやる方が早い。でもそれでいいのかわからない', type: 'feeling' },
      { id: 'n2', label: 'マインドフルネスと子育て — 介入しすぎないことの難しさ', type: 'learn' },
      { id: 'n3', label: '近所の友達の子は自分で勉強していると聞いた', type: 'ref' },
    ],
    questions: [
      { id: 'q1', question_type: 'dig', body: '「早く終わらせたい」の奥に、何の不安がある？', user_thoughts: '自分の時間が欲しい、でもそれを言えない', note_id: 'n1' },
      { id: 'q2', question_type: 'con', body: '仕事で「任せる練習」をしているのと、子どもへの関わりは似ているか？', user_thoughts: null, note_id: 'n2' },
      { id: 'q3', question_type: 'ref', body: '友達の子と比べることは、本当に役に立っている？', user_thoughts: null, note_id: 'n3' },
      { id: 'q4', question_type: 'act', body: '今週、宿題の場面で「待つ」時間を1回だけ試すとしたら？', user_thoughts: null, note_id: 'n1' },
    ],
    subthemes: [
      { label: '焦りの根', question_ids: ['q1', 'q3'] },
      { label: '任せる練習', question_ids: ['q2', 'q4'] },
    ],
  },
};

export async function generateImageBatch(
  exploration,
  { variantIds, generateImages, imageSize, recommendedOnly } = {},
) {
  return postJson('/api/generate-image-batch', {
    exploration,
    variantIds,
    generateImages,
    imageSize: imageSize ?? GRAPHIC_REC_SIZE.openAiSize,
    recommendedOnly: Boolean(recommendedOnly),
  });
}

export async function generateSingleImage(prompt, imageSize) {
  return postJson('/api/generate-image', {
    prompt,
    size: imageSize ?? GRAPHIC_REC_SIZE.openAiSize,
  });
}
