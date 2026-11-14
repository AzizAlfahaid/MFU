const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩'
const PERSIAN = '۰۱۲۳۴۵۶۷۸۹'

/** Reads a number typed with Western, Arabic-Indic or Persian digits; '.', ',' or '٫' as the decimal mark. */
export function parseNumber(input: string): number | null {
  let s = input.trim()
  if (!s) return null
  s = s.replace(/[٠-٩]/g, (c) => String(ARABIC_INDIC.indexOf(c))).replace(/[۰-۹]/g, (c) => String(PERSIAN.indexOf(c)))
  s = s.replace(/[٫,]/g, '.')
  if (!/^\d+(\.\d+)?$/.test(s)) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}
