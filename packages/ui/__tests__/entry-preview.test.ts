import {
  entryPreview,
  entryPreviewShort,
  entryHasContent,
  imagePreview,
  formatBytes,
  EMPTY_PREVIEW,
} from '../src/lib/entry-preview';

function assert(condition: unknown, message: string): void {
  console.assert(condition, message);
  if (!condition) throw new Error(message);
}

function test_prefers_preview_over_content() {
  const out = entryPreview({ content_preview: 'short', content: 'a much longer body' });
  assert(out === 'short', `preview should win, got ${out}`);
}

function test_falls_back_to_content_when_preview_null() {
  const out = entryPreview({ content_preview: null, content: 'full body text' });
  assert(out === 'full body text', `null preview should fall back to content, got ${out}`);
}

function test_returns_placeholder_when_both_null() {
  assert(entryPreview({ content_preview: null, content: null }) === EMPTY_PREVIEW,
    'both null → placeholder');
}

function test_returns_placeholder_when_both_empty() {
  assert(entryPreview({ content_preview: '', content: '' }) === EMPTY_PREVIEW,
    'both empty → placeholder');
}

function test_collapses_whitespace() {
  const out = entryPreview({ content_preview: 'line one\n\n  line two\t', content: null });
  assert(out === 'line one line two', `whitespace should collapse, got "${out}"`);
}

function test_whitespace_only_is_placeholder() {
  assert(entryPreview({ content_preview: '   \n  ', content: null }) === EMPTY_PREVIEW,
    'whitespace-only preview → placeholder');
}

function test_short_truncates_with_ellipsis() {
  const out = entryPreviewShort({ content_preview: 'abcdefghijklmnopqrstuvwxyz', content: null }, 10);
  assert(out === 'abcdefghij…', `expected 10 chars + ellipsis, got "${out}"`);
}

function test_short_does_not_truncate_when_fitting() {
  const out = entryPreviewShort({ content_preview: 'short', content: null }, 20);
  assert(out === 'short', `short text should be unchanged, got "${out}"`);
}

function test_short_handles_null_preview() {
  // Regression: the old CommandPalette did `entry.content_preview.slice(...)`,
  // which threw a TypeError on a null preview.
  const out = entryPreviewShort({ content_preview: null, content: null });
  assert(out === EMPTY_PREVIEW, `null preview must not throw, got "${out}"`);
}

function test_has_content_true_for_text() {
  assert(entryHasContent({ content: 'hello' }), 'non-empty content is usable');
}

function test_has_content_false_for_null() {
  assert(!entryHasContent({ content: null }), 'null content is not usable');
}

function test_has_content_false_for_whitespace() {
  assert(!entryHasContent({ content: '   \n ' }), 'whitespace-only content is not usable');
}

function test_has_content_false_for_image_entry() {
  // Image entries carry no text at all, which is what gates the AI actions.
  assert(!entryHasContent({ content: null }), 'an image entry has nothing to send to the AI');
}

function test_image_preview_shows_dimensions() {
  const out = imagePreview(1920, 1080);
  assert(out === '图片 1920×1080', `expected dimensions in the preview, got "${out}"`);
}

function test_image_preview_keeps_small_sizes_verbatim() {
  const out = imagePreview(16, 16);
  assert(out === '图片 16×16', `small bitmaps need no special casing, got "${out}"`);
}

function test_format_bytes_below_one_kilobyte() {
  assert(formatBytes(0) === '0 B', `0 bytes, got "${formatBytes(0)}"`);
  assert(formatBytes(512) === '512 B', `512 bytes, got "${formatBytes(512)}"`);
}

function test_format_bytes_one_decimal_below_ten() {
  assert(formatBytes(1024) === '1.0 KB', `1024 bytes, got "${formatBytes(1024)}"`);
  assert(formatBytes(1536) === '1.5 KB', `1536 bytes, got "${formatBytes(1536)}"`);
}

function test_format_bytes_rounds_at_and_above_ten() {
  // 10 MB: a decimal would be noise at this scale, so it is rounded away.
  const tenMb = 10 * 1024 * 1024;
  assert(formatBytes(tenMb) === '10 MB', `10 MB, got "${formatBytes(tenMb)}"`);
}

function test_format_bytes_climbs_to_gigabytes() {
  const oneGb = 1024 * 1024 * 1024;
  assert(formatBytes(oneGb) === '1.0 GB', `1 GB, got "${formatBytes(oneGb)}"`);
}

function test_format_bytes_never_goes_negative_or_nan() {
  // Defensive: a corrupt row could carry a nonsense size, and "NaN GB" in the
  // detail view would look like a crash.
  assert(formatBytes(-1) === '-1 B', `negative sizes stay in bytes, got "${formatBytes(-1)}"`);
}

function main() {
  const tests = [
    test_prefers_preview_over_content,
    test_falls_back_to_content_when_preview_null,
    test_returns_placeholder_when_both_null,
    test_returns_placeholder_when_both_empty,
    test_collapses_whitespace,
    test_whitespace_only_is_placeholder,
    test_short_truncates_with_ellipsis,
    test_short_does_not_truncate_when_fitting,
    test_short_handles_null_preview,
    test_has_content_true_for_text,
    test_has_content_false_for_null,
    test_has_content_false_for_whitespace,
    test_has_content_false_for_image_entry,
    test_image_preview_shows_dimensions,
    test_image_preview_keeps_small_sizes_verbatim,
    test_format_bytes_below_one_kilobyte,
    test_format_bytes_one_decimal_below_ten,
    test_format_bytes_rounds_at_and_above_ten,
    test_format_bytes_climbs_to_gigabytes,
    test_format_bytes_never_goes_negative_or_nan,
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
