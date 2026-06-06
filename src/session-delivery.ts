export function shouldSkipSessionOutput(previousFinalText: string, nextFinalText: string): boolean {
  return Boolean(previousFinalText) && previousFinalText === nextFinalText;
}
