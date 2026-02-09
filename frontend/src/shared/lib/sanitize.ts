const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g
const TAGS = /<[^>]*>/g

export const sanitizeText = (input: string, maxLen = 1000) => {
  if (!input) return ''
  const withoutTags = input.replace(TAGS, '')
  const withoutControls = withoutTags.replace(CONTROL_CHARS, '')
  const trimmed = withoutControls.trim()
  if (trimmed.length > maxLen) {
    return trimmed.slice(0, maxLen)
  }
  return trimmed
}
