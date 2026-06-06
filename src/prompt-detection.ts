export function detectConfirmationPrompt(text: string): boolean {
  const normalized = normalizePromptText(text);
  if (!normalized) {
    return false;
  }

  const explicitPatterns = [
    /\[[^\]]*(?:y\/n|yes\/no)[^\]]*\]/i,
    /\b(?:y\/n|yes\/no)\b/i,
    /\bcontinue\?/i,
    /\bare you sure\??\b/i,
    /\bpress enter to confirm\b/i,
    /\bconfirm(?:\?| this\?| action\?| this \[[^\]]*(?:y\/n|yes\/no)[^\]]*\]| action \[[^\]]*(?:y\/n|yes\/no)[^\]]*\])(?!\w)/i
  ];

  return explicitPatterns.some((pattern) => pattern.test(normalized));
}

function normalizePromptText(text: string): string {
  return text
    .replace(/\u001b\][^\u0007]*\u0007/g, ' ')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim()
    .toLowerCase();
}
