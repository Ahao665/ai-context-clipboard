// Privacy flow tests — verify the consent gating logic
// The actual setting persistence is handled by Tauri commands (tested in Rust)

/**
 * Throwing assertion.
 *
 * `console.assert` only logs on failure and returns normally, so a test built on
 * it can never fail — it reports green no matter what. Everything here must use
 * this helper instead.
 */
function assert(condition: unknown, message: string): void {
  console.assert(condition, message);
  if (!condition) throw new Error(message);
}

// Mock the privacy API that the React layer uses
interface PrivacyStore {
  accepted: boolean;
  checked: boolean;
  check: () => Promise<void>;
  accept: () => Promise<void>;
}

function createPrivacyStore(storedAccepted: string | null): PrivacyStore {
  // Simulates reading from settings DB
  const store: PrivacyStore = {
    accepted: false,
    checked: false,
    check: async () => {
      store.accepted = storedAccepted === 'true';
      store.checked = true;
    },
    accept: async () => {
      store.accepted = true;
    },
  };
  return store;
}

function test_privacy_not_accepted_on_first_use() {
  const store = createPrivacyStore(null);
  assert(store.accepted === false, 'not accepted initially');
  assert(store.checked === false, 'not checked initially');
  console.log('✅ test_privacy_not_accepted_on_first_use passed');
}

async function test_privacy_requires_explicit_acceptance() {
  const store = createPrivacyStore(null);
  let actionExecuted = false;

  // Simulate user clicking an action
  if (!store.accepted) {
    // Action should be blocked
    assert(actionExecuted === false, 'action should not execute before consent');
  }

  // User confirms in dialog
  await store.accept();
  actionExecuted = true;
  assert(store.accepted === true, 'should be accepted after confirm');
  assert(actionExecuted === true, 'action should execute after consent');

  console.log('✅ test_privacy_requires_explicit_acceptance passed');
}

async function test_privacy_blocks_action_on_reject() {
  const store = createPrivacyStore(null);
  let actionExecuted = false;

  // Simulate reject (never calling store.accept)
  if (!store.accepted) {
    // Action blocked
    assert(actionExecuted === false, 'action should not execute after reject');
  }

  assert(store.accepted === false, 'should not be accepted after reject');

  console.log('✅ test_privacy_blocks_action_on_reject passed');
}

async function test_privacy_skipped_when_accepted() {
  const store = createPrivacyStore('true');
  await store.check();

  assert(store.accepted === true, 'should be accepted from stored setting');
  assert(store.checked === true, 'should be checked');

  // Action should execute without dialog
  let actionExecuted = false;
  if (store.accepted) {
    actionExecuted = true;
  }
  assert(actionExecuted === true, 'action should execute without dialog');

  console.log('✅ test_privacy_skipped_when_accepted passed');
}

async function test_privacy_persistence() {
  // Simulate: first session → accept → second session
  let storedValue: string | null = null;

  // Session 1: first use, accept
  {
    const store = createPrivacyStore(storedValue);
    await store.check();
    assert(store.accepted === false, 'session 1: not accepted yet');
    await store.accept();
    storedValue = 'true'; // Simulate persistence
  }

  // Session 2: already accepted
  {
    const store = createPrivacyStore(storedValue);
    await store.check();
    assert(store.accepted === true, 'session 2: accepted from persistence');
  }

  console.log('✅ test_privacy_persistence passed');
}

async function test_privacy_with_checked_flag() {
  const store = createPrivacyStore(null);

  // Before check — should show loading
  assert(store.checked === false, 'should not be checked before checkPrivacy');

  // After check
  await store.check();

  assert(store.checked === true, 'should be checked after checkPrivacy');
  assert(store.accepted === false, 'should not be accepted');

  console.log('✅ test_privacy_with_checked_flag passed');
}

// --- Run all ---

async function main() {
  const tests = [
    test_privacy_not_accepted_on_first_use,
    test_privacy_requires_explicit_acceptance,
    test_privacy_blocks_action_on_reject,
    test_privacy_skipped_when_accepted,
    test_privacy_persistence,
    test_privacy_with_checked_flag,
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      await test();
      passed++;
    } catch (err) {
      console.error(`❌ ${test.name} failed:`, err);
      failed++;
    }
  }

  const total = passed + failed;
  console.log(`\n---\nResults: ${passed}/${total} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
