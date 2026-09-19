import type { ContentType } from '@ai-clipboard/types';

/** Result of classifying a piece of clipboard text. */
export interface Detection {
  contentType: ContentType;
  /**
   * Finer-grained label. Single-valued, so priority order is:
   * `sensitive` > language (e.g. `python`) > `path` / `color` > undefined.
   */
  subtype?: string;
  /** True when the text looks like a credential — used for the privacy warning. */
  sensitive: boolean;
}

const URL_RE = /^(https?:\/\/|www\.)[^\s]+$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const WINDOWS_PATH_RE = /^[a-z]:\\(?:[^\\/:*?"<>|\r\n]+\\)*[^\\/:*?"<>|\r\n]*$/i;
const UNIX_PATH_RE = /^(?:~|\/)[^\0]*$/;

/**
 * Credential shapes. Deliberately conservative — a false positive only costs a
 * warning badge, but a false negative would let a secret sit in plain text.
 */
const SENSITIVE_PATTERNS: RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  // No leading \b: identifiers like `db_password` have no word boundary before
  // `password` because `_` is itself a word character. The trailing `[:=]`
  // anchor keeps this from matching unrelated words (e.g. `secretary:`).
  /(?:password|passwd|pwd|secret|token|api[_-]?key|apikey|access[_-]?key)\s*[:=]/i,
  /\bsk-[a-zA-Z0-9_-]{16,}\b/,
  /\bgh[pousr]_[a-zA-Z0-9]{20,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bBearer\s+[a-zA-Z0-9._-]{20,}\b/i,
  /\beyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\b/,
  /mysql:\/\/[^:]+:[^@]+@/i,
  /postgres(?:ql)?:\/\/[^:]+:[^@]+@/i,
];

/** Language hints, most specific first. */
const LANGUAGE_HINTS: Array<{ subtype: string; test: RegExp }> = [
  { subtype: 'rust', test: /\b(?:fn\s+\w+\s*\(|let\s+mut\s+|impl\s+\w+|pub\s+(?:fn|struct|enum)|println!|use\s+std::)/ },
  { subtype: 'python', test: /(?:^|\n)\s*(?:def\s+\w+\s*\(|class\s+\w+.*:|import\s+\w+$|from\s+\w+\s+import\s)/m },
  { subtype: 'go', test: /\bpackage\s+\w+\s*\n|\bfunc\s+\w+\s*\(|\bfmt\.(?:Print|Sprint)/ },
  { subtype: 'sql', test: /\b(?:SELECT|INSERT\s+INTO|UPDATE\s+\w+\s+SET|CREATE\s+TABLE|DELETE\s+FROM)\b/i },
  { subtype: 'html', test: /<\/?(?:html|div|span|body|head|p|a|ul|li|table)\b[^>]*>/i },
  { subtype: 'java', test: /\b(?:public|private)\s+(?:static\s+)?(?:class|void|String)\b|System\.out\.print/ },
  { subtype: 'c', test: /^\s*#include\s*[<"]|\bint\s+main\s*\(/m },
  { subtype: 'javascript', test: /\b(?:function\s+\w+|const\s+\w+\s*=|let\s+\w+\s*=|=>|console\.log)\b/ },
  { subtype: 'typescript', test: /\b(?:interface\s+\w+|type\s+\w+\s*=|:\s*(?:string|number|boolean)\b|enum\s+\w+)/ },
  { subtype: 'shell', test: /^#!\/(?:usr\/)?bin\/(?:ba|z)?sh|\b(?:sudo|apt-get|npm\s+install|pip\s+install)\b/m },
];

/** Structural signals that the text is source code rather than prose. */
const CODE_SIGNALS: RegExp[] = [
  /[{};]\s*$/m,
  /\b(?:function|class|interface|import|export|return|const|let|var|def|fn|struct|enum)\b/,
  /=>|->|::|\+\+|===|!==/,
  /^\s{2,}\S/m,
  /[()]\s*\{/,
  /<\/?[a-z][\w-]*>/i,
];

/**
 * True when `text` looks like source code.
 *
 * Prose can contain a stray keyword, so a single signal is not enough — we need
 * at least two. Short strings are excluded because one-liners like
 * "let me know" would otherwise score too easily.
 */
export function looksLikeCode(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 12) return false;
  // Prose with sentence punctuation and spaces but no code punctuation.
  const signals = CODE_SIGNALS.reduce((n, re) => (re.test(trimmed) ? n + 1 : n), 0);
  if (signals < 2) return false;

  const lines = trimmed.split('\n');
  const codeishLines = lines.filter((l) => /[{}();=<>[\]]/.test(l)).length;
  // Require a decent share of lines to carry code punctuation.
  return codeishLines / lines.length >= 0.4;
}

/** True when `text` looks like it contains a credential. */
export function looksSensitive(text: string): boolean {
  return SENSITIVE_PATTERNS.some((re) => re.test(text));
}

function guessLanguage(text: string): string | undefined {
  return LANGUAGE_HINTS.find((l) => l.test.test(text))?.subtype;
}

function tryParseJson(trimmed: string): boolean {
  const first = trimmed[0];
  if (first !== '{' && first !== '[') return false;
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

/**
 * Classify clipboard text.
 *
 * Detection is intentionally single-line-aware: a URL or email is only treated
 * as such when the whole payload is one, so pasting a paragraph that happens to
 * contain a link still classifies as text.
 */
export function detectContent(raw: string): Detection {
  const trimmed = raw.trim();
  if (!trimmed) return { contentType: 'unknown', sensitive: false };

  const sensitive = looksSensitive(trimmed);
  const lines = trimmed.split('\n');
  const singleLine = lines.length === 1;

  // --- Whole-payload formats ---------------------------------------------
  if (tryParseJson(trimmed)) {
    return { contentType: 'json', subtype: sensitive ? 'sensitive' : undefined, sensitive };
  }
  if (singleLine && URL_RE.test(trimmed)) {
    return { contentType: 'url', subtype: sensitive ? 'sensitive' : undefined, sensitive };
  }
  if (singleLine && EMAIL_RE.test(trimmed)) {
    return { contentType: 'email', subtype: sensitive ? 'sensitive' : undefined, sensitive };
  }

  // --- Code ---------------------------------------------------------------
  if (looksLikeCode(trimmed)) {
    return {
      contentType: 'code',
      subtype: sensitive ? 'sensitive' : guessLanguage(trimmed),
      sensitive,
    };
  }

  // --- Text with a useful subtype -----------------------------------------
  if (singleLine && COLOR_RE.test(trimmed)) {
    return { contentType: 'text', subtype: sensitive ? 'sensitive' : 'color', sensitive };
  }
  if (singleLine && (WINDOWS_PATH_RE.test(trimmed) || UNIX_PATH_RE.test(trimmed))) {
    return { contentType: 'text', subtype: sensitive ? 'sensitive' : 'path', sensitive };
  }

  return { contentType: 'text', subtype: sensitive ? 'sensitive' : undefined, sensitive };
}

/** Human-readable label for a content type, used by filter chips and badges. */
export const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  text: '文本',
  code: '代码',
  url: '链接',
  json: 'JSON',
  email: '邮箱',
  unknown: '其他',
};

/** Emoji shown for a content type. Mirrors the UI icon maps. */
export const CONTENT_TYPE_ICONS: Record<ContentType, string> = {
  text: '📝',
  code: '💻',
  url: '🔗',
  json: '📊',
  email: '✉️',
  unknown: '📋',
};
