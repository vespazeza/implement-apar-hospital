// ตัดคำแบบง่าย: แยกด้วยอักขระที่ไม่ใช่ตัวอักษร/ตัวเลข — จับคำ/รหัส error ที่ซ้ำกันตรงๆ
const tokenize = (text) =>
  String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9ก-๙]+/)
    .filter(Boolean)

// Bigram ระดับตัวอักษร — ใช้จับความคล้ายของประโยคภาษาไทยที่ไม่มีช่องว่างระหว่างคำ
const charBigrams = (text) => {
  const s = String(text || '').toLowerCase().replace(/\s+/g, '')
  const grams = new Set()
  for (let i = 0; i < s.length - 1; i++) grams.add(s.slice(i, i + 2))
  return grams
}

const intersectionSize = (setA, setB) => {
  let count = 0
  for (const x of setA) if (setB.has(x)) count++
  return count
}

const jaccard = (setA, setB) => {
  if (setA.size === 0 && setB.size === 0) return 0
  const inter = intersectionSize(setA, setB)
  const union = setA.size + setB.size - inter
  return union === 0 ? 0 : inter / union
}

const dice = (setA, setB) => {
  if (setA.size === 0 || setB.size === 0) return 0
  return (2 * intersectionSize(setA, setB)) / (setA.size + setB.size)
}

// คะแนนความคล้าย 0–1 ระหว่างข้อความสองอัน ใช้เทียบ "รายละเอียดปัญหา" ที่พิมพ์เป็นภาษาไทยอิสระ
export function textSimilarity(a, b) {
  const wordScore = jaccard(new Set(tokenize(a)), new Set(tokenize(b)))
  const bigramScore = dice(charBigrams(a), charBigrams(b))
  return Math.max(wordScore, bigramScore)
}
