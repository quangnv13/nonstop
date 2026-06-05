export interface OutputFilterConfig {
  duplicateThreshold: number;
  spinnerCharRatio: number;
  minSpinnerChars: number;
}

export interface OutputFilterDecision {
  shouldSend: boolean;
  reason: 'send' | 'duplicate' | 'spinner';
  similarity: number;
}

const DEFAULT_CONFIG: OutputFilterConfig = {
  duplicateThreshold: 0.7,
  spinnerCharRatio: 0.6,
  minSpinnerChars: 8
};

const SPINNER_GLYPHS = /[⠁-⣿⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏◐◓◑◒◴◷◶◵◰◳◲◱|/\\-]/g;

export function buildOutputFilterConfig(env: NodeJS.ProcessEnv): OutputFilterConfig {
  return {
    duplicateThreshold: clampNumber(parseNumber(env.OUTPUT_DUPLICATE_THRESHOLD, DEFAULT_CONFIG.duplicateThreshold), 0, 1),
    spinnerCharRatio: clampNumber(parseNumber(env.OUTPUT_SPINNER_CHAR_RATIO, DEFAULT_CONFIG.spinnerCharRatio), 0, 1),
    minSpinnerChars: Math.max(1, Math.round(parseNumber(env.OUTPUT_SPINNER_MIN_CHARS, DEFAULT_CONFIG.minSpinnerChars)))
  };
}

export function decideOutputDelivery(
  previousSnapshot: string,
  nextSnapshot: string,
  config: OutputFilterConfig,
  bypassDuplicateCheck = false
): OutputFilterDecision {
  const normalizedNext = normalizeOutput(nextSnapshot);
  const normalizedPrevious = normalizeOutput(previousSnapshot);

  if (!normalizedNext) {
    return {
      shouldSend: false,
      reason: 'spinner',
      similarity: 0
    };
  }

  if (isSpinnerLike(normalizedNext, config)) {
    return {
      shouldSend: false,
      reason: 'spinner',
      similarity: 0
    };
  }

  const similarity = normalizedPrevious
    ? calculateDiceSimilarity(normalizedPrevious, normalizedNext)
    : 0;

  if (hasMeaningfulSelectionChange(normalizedPrevious, normalizedNext)) {
    return {
      shouldSend: true,
      reason: 'send',
      similarity
    };
  }

  if (!bypassDuplicateCheck && normalizedPrevious && similarity >= config.duplicateThreshold) {
    return {
      shouldSend: false,
      reason: 'duplicate',
      similarity
    };
  }

  return {
    shouldSend: true,
    reason: 'send',
    similarity
  };
}

export function normalizeOutput(text: string): string {
  return text
    .replace(/\r/g, '\n')
    .replace(/\u0000/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .toLowerCase();
}

export function isSpinnerLike(text: string, config: OutputFilterConfig): boolean {
  const compact = text.replace(/\s/g, '');
  if (compact.length < config.minSpinnerChars) {
    return false;
  }

  const spinnerMatches = compact.match(SPINNER_GLYPHS) || [];
  const spinnerRatio = spinnerMatches.length / compact.length;

  if (spinnerRatio >= config.spinnerCharRatio) {
    return true;
  }

  const stripped = compact.replace(SPINNER_GLYPHS, '');
  if (stripped.length > 0 && stripped.length <= 4 && spinnerRatio >= 0.4) {
    return true;
  }

  return spinnerMatches.length >= 4 && /^(loading|thinking|working|pleasewait|wait)$/i.test(stripped);
}

function hasMeaningfulSelectionChange(previousText: string, nextText: string): boolean {
  if (!previousText || !nextText || previousText === nextText) {
    return false;
  }

  const previousLines = previousText.split('\n').map(line => line.trim());
  const nextLines = nextText.split('\n').map(line => line.trim());
  const maxLength = Math.max(previousLines.length, nextLines.length);

  for (let index = 0; index < maxLength; index += 1) {
    const previousLine = previousLines[index] || '';
    const nextLine = nextLines[index] || '';

    if (previousLine === nextLine) {
      continue;
    }

    if (isSelectionLine(previousLine) || isSelectionLine(nextLine)) {
      return true;
    }
  }

  return false;
}

function isSelectionLine(line: string): boolean {
  return /^(>|\*|❯|›|»|→|\[[ x]\])\s+/i.test(line);
}

function calculateDiceSimilarity(left: string, right: string): number {
  if (left === right) {
    return 1;
  }

  if (left.length < 2 || right.length < 2) {
    return left === right ? 1 : 0;
  }

  const leftBigrams = toBigramMap(left);
  const rightBigrams = toBigramMap(right);

  let overlap = 0;
  for (const [gram, count] of leftBigrams.entries()) {
    overlap += Math.min(count, rightBigrams.get(gram) || 0);
  }

  return (2 * overlap) / (left.length - 1 + right.length - 1);
}

function toBigramMap(text: string): Map<string, number> {
  const grams = new Map<string, number>();
  for (let index = 0; index < text.length - 1; index += 1) {
    const gram = text.slice(index, index + 2);
    grams.set(gram, (grams.get(gram) || 0) + 1);
  }
  return grams;
}

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
