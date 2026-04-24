export const COMMON_CHAR_FIX_REPLACEMENTS = Object.freeze({
  '⻔': '门',
  '⻆': '角',
  '⻛': '风',
  '⻓': '长',
  '⻢': '马',
  '⻋': '车',
  '⻅': '见',
  '⻝': '食',
  '⻌': '辶',
  '⻍': '辶',
  '⺀': '冫',
  '⺁': '厂',
  '⺄': '乙',
  '⺈': '刀',
  '⺋': '卩',
  '⺌': '小',
  '⺕': '彐',
  '⺧': '牛',
  '⺪': '阝',
  '⺮': '竹',
  '⺼': '月',
  '⻂': '衣',
  '⻎': '辶',
  '⻏': '阝',
  '⻐': '钅',
  '⻑': '长',
  '⻒': '尢',
  '⻕': '阝',
  '⻖': '阝',
  '⻗': '雨',
  '⻘': '青',
  '⻙': '韦',
  '⻚': '页',
  '⻜': '飞',
  '⻟': '食',
  '⻠': '饣',
  '⻣': '骨',
  '⻤': '鬼',
  '⻥': '鱼',
  '⻦': '鸟',
  '⻧': '卤',
  '⻨': '麦',
  '⻩': '黄',
  '⻪': '黾',
  '⻫': '齐',
  '⻬': '齐',
  '⻭': '齿',
  '⻮': '齿',
  '︰': ':',
  '﹣': '-',
  '－': '-',
  '﹢': '+',
  '／': '/',
  '＼': '\\',
  '，': '，',
  '。': '。',
  '；': '；',
  '：': '：',
  '！': '！',
  '？': '？',
})

export function replaceCommonProblemChars(input) {
  let out = String(input || '')
  for (const [from, to] of Object.entries(COMMON_CHAR_FIX_REPLACEMENTS)) {
    if (!from || from === to) continue
    out = out.replaceAll(from, to)
  }
  return out
}

export function isKnownProblemGlyph(ch) {
  return Object.prototype.hasOwnProperty.call(COMMON_CHAR_FIX_REPLACEMENTS, ch)
}

export function normalizeRichTextInput(input) {
  let text = String(input || '')
  text = text.replace(/\r\n?/g, '\n')
  text = text.normalize('NFKC')
  text = replaceCommonProblemChars(text)
  text = text.replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
  text = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
  text = text.replace(/[\u00A0\u202F\u2007\u2000-\u200A\u205F]/g, ' ')
  text = text.replace(/\u3000/g, ' ')
  text = text.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[–—―]/g, '-').replace(/…/g, '...')
  text = text.replace(/[\uE000-\uF8FF]/g, '')
  text = text.replace(/[\u{1F300}-\u{1FAFF}]/gu, '')
  return text
}

export function isSuspiciousForTemplate(ch) {
  const cp = ch.codePointAt(0) || 0
  if (!cp) return false
  if ((cp >= 0x200b && cp <= 0x200f) || (cp >= 0x202a && cp <= 0x202e) || (cp >= 0x2060 && cp <= 0x206f)) return true
  if (cp >= 0x1d400 && cp <= 0x1d7ff) return true
  if ((cp >= 0x2100 && cp <= 0x214f) || (cp >= 0x2460 && cp <= 0x24ff)) return true
  if ((cp >= 0xe000 && cp <= 0xf8ff) || (cp >= 0x1f300 && cp <= 0x1faff)) return true
  return false
}

export function isTemplateSafeChar(ch) {
  if (!ch) return true
  const cp = ch.codePointAt(0) || 0
  if (!cp) return true
  if (ch === '\n' || ch === '\t') return true
  if (cp >= 0x20 && cp <= 0x7e) return true
  if (cp >= 0x00a0 && cp <= 0x024f) return true
  if (cp >= 0x0370 && cp <= 0x03ff) return true
  if (cp >= 0x2000 && cp <= 0x206f) return true
  if (cp >= 0x3000 && cp <= 0x303f) return true
  if (cp >= 0x3400 && cp <= 0x4dbf) return true
  if (cp >= 0x4e00 && cp <= 0x9fff) return true
  if (cp >= 0xf900 && cp <= 0xfaff) return true
  return false
}
