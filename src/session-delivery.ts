export function shouldSkipSessionOutput(previousFinalText: string, nextFinalText: string): boolean {
  if (!previousFinalText || !nextFinalText) {
    return false;
  }

  const normalize = (text: string) =>
    text
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .join('\n');

  return normalize(previousFinalText) === normalize(nextFinalText);
}
