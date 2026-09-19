import { detectContent, looksLikeCode, looksSensitive } from '../src/detect/content-type';

function assert(condition: unknown, message: string): void {
  console.assert(condition, message);
  if (!condition) throw new Error(message);
}

function assertType(input: string, expectedType: string, label: string) {
  const got = detectContent(input).contentType;
  assert(got === expectedType, `${label}: expected ${expectedType}, got ${got}`);
}

// --- Content types --------------------------------------------------------

function test_url_detection() {
  assertType('https://github.com/Ahao665/ai-context-clipboard', 'url', 'https url');
  assertType('http://localhost:1420', 'url', 'http url');
  assertType('www.example.com/path?q=1', 'url', 'www url');
}

function test_url_requires_single_line() {
  // A paragraph containing a link is prose, not a URL payload.
  const prose = 'Check this out https://example.com for details';
  assertType(prose, 'text', 'prose with inline link');
}

function test_email_detection() {
  assertType('someone@example.com', 'email', 'plain email');
  assertType('first.last+tag@sub.example.co.uk', 'email', 'tagged email');
}

function test_email_not_matched_inside_text() {
  assertType('email me at a@b.com please', 'text', 'email inside sentence');
}

function test_json_detection() {
  assertType('{"name":"ai-context-clipboard","stars":0}', 'json', 'object json');
  assertType('[1,2,3]', 'json', 'array json');
  assertType('{\n  "a": 1\n}', 'json', 'multiline json');
}

function test_invalid_json_falls_back() {
  // Starts with { but is not parseable.
  assertType('{ not really json', 'text', 'broken json');
}

function test_code_detection_javascript() {
  const r = detectContent('const x = 1;\nfunction add(a, b) {\n  return a + b;\n}');
  assert(r.contentType === 'code', `js should be code, got ${r.contentType}`);
  assert(r.subtype === 'javascript', `js subtype, got ${r.subtype}`);
}

function test_code_detection_python() {
  const r = detectContent('def greet(name):\n    return f"hi {name}"');
  assert(r.contentType === 'code', `python should be code, got ${r.contentType}`);
  assert(r.subtype === 'python', `python subtype, got ${r.subtype}`);
}

function test_code_detection_rust() {
  const r = detectContent('pub fn add(a: i32, b: i32) -> i32 {\n    a + b\n}');
  assert(r.contentType === 'code', `rust should be code, got ${r.contentType}`);
  assert(r.subtype === 'rust', `rust subtype, got ${r.subtype}`);
}

function test_prose_is_not_code() {
  const prose =
    'I think we should return to the office next week, and let the team know. ' +
    'The import of those goods was delayed.';
  assert(!looksLikeCode(prose), 'ordinary prose must not be classified as code');
  assertType(prose, 'text', 'prose');
}

function test_short_text_not_code() {
  assert(!looksLikeCode('let me know'), '"let me know" must not be code');
  assert(!looksLikeCode('const'), 'bare keyword must not be code');
}

function test_chinese_prose_is_text() {
  assertType('明天下午三点开会，记得带上季度报表。', 'text', 'chinese prose');
}

function test_color_subtype() {
  const r = detectContent('#4fc3f7');
  assert(r.contentType === 'text', `color is text, got ${r.contentType}`);
  assert(r.subtype === 'color', `color subtype, got ${r.subtype}`);
}

function test_path_subtype() {
  const win = detectContent('C:\\Users\\豪豪\\ai-context-clipboard');
  assert(win.subtype === 'path', `windows path subtype, got ${win.subtype}`);
  const unix = detectContent('/usr/local/bin/node');
  assert(unix.subtype === 'path', `unix path subtype, got ${unix.subtype}`);
}

function test_empty_and_whitespace() {
  assert(detectContent('').contentType === 'unknown', 'empty → unknown');
  assert(detectContent('   \n  ').contentType === 'unknown', 'whitespace → unknown');
  assert(detectContent('').sensitive === false, 'empty is not sensitive');
}

// --- Sensitive detection --------------------------------------------------

function test_detects_private_key() {
  assert(
    looksSensitive('-----BEGIN RSA PRIVATE KEY-----\nMIIEow...'),
    'private key must be flagged',
  );
}

function test_detects_password_assignment() {
  assert(looksSensitive('password=Hunter2!'), 'password= must be flagged');
  assert(looksSensitive('PASSWORD: secret123'), 'PASSWORD: must be flagged');
  assert(looksSensitive('db_password = "abc"'), 'db_password must be flagged');
}

function test_detects_api_keys() {
  assert(looksSensitive('sk-abcdefghijklmnopqrstuvwxyz1234'), 'openai-style key flagged');
  assert(looksSensitive('ghp_abcdefghijklmnopqrstuvwxyz0123456789'), 'github pat flagged');
  assert(looksSensitive('AKIAIOSFODNN7EXAMPLE'), 'aws key id flagged');
  assert(looksSensitive('api_key: 8f2b1c9d'), 'api_key: flagged');
}

function test_detects_jwt() {
  const jwt =
    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk';
  assert(looksSensitive(jwt), 'jwt must be flagged');
}

function test_detects_connection_string() {
  assert(looksSensitive('postgres://user:s3cret@localhost:5432/db'), 'pg connstring flagged');
}

function test_normal_text_not_sensitive() {
  assert(!looksSensitive('明天下午三点开会'), 'chinese prose not sensitive');
  assert(!looksSensitive('https://example.com/docs'), 'plain url not sensitive');
  assert(!looksSensitive('function add(a,b){return a+b}'), 'code not sensitive');
}

function test_sensitive_subtype_wins() {
  // A credential that also parses as JSON — the sensitive label must win so the
  // UI can warn the user.
  const r = detectContent('{"api_key":"sk-abcdefghijklmnopqrstuvwxyz1234"}');
  assert(r.sensitive === true, 'json payload with key must be sensitive');
  assert(r.subtype === 'sensitive', `subtype should be sensitive, got ${r.subtype}`);
}

function test_sensitive_flag_on_plain_password() {
  const r = detectContent('password=Hunter2!');
  assert(r.sensitive, 'password= must set sensitive');
  assert(r.subtype === 'sensitive', `subtype sensitive, got ${r.subtype}`);
}

function main() {
  const tests = [
    test_url_detection,
    test_url_requires_single_line,
    test_email_detection,
    test_email_not_matched_inside_text,
    test_json_detection,
    test_invalid_json_falls_back,
    test_code_detection_javascript,
    test_code_detection_python,
    test_code_detection_rust,
    test_prose_is_not_code,
    test_short_text_not_code,
    test_chinese_prose_is_text,
    test_color_subtype,
    test_path_subtype,
    test_empty_and_whitespace,
    test_detects_private_key,
    test_detects_password_assignment,
    test_detects_api_keys,
    test_detects_jwt,
    test_detects_connection_string,
    test_normal_text_not_sensitive,
    test_sensitive_subtype_wins,
    test_sensitive_flag_on_plain_password,
  ];
  let passed = 0;
  let failed = 0;
  for (const test of tests) {
    try {
      test();
      console.log(`✅ ${test.name} passed`);
      passed++;
    } catch (err) {
      console.error(`❌ ${test.name} failed:`, err);
      failed++;
    }
  }
  console.log(`\n---\nResults: ${passed}/${tests.length} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
