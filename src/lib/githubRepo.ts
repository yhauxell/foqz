export function normalizeGithubRepoInput(input: string): string {
  let trimmed = input.trim()
  if (!trimmed) return ''
  trimmed = trimmed.replace(/^git@github\.com:/, '')
  trimmed = trimmed.replace(/^https?:\/\/(www\.)?github\.com\//, '')
  trimmed = trimmed.replace(/\.git$/, '')
  trimmed = trimmed.replace(/[?#].*$/, '')
  const parts = trimmed.split('/').filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0]}/${parts[1]}`
  }
  return trimmed
}
