import { EventBus, globalEventBus } from '../src/event-bus';

function assert(condition: unknown, message: string): void {
  console.assert(condition, message);
  if (!condition) throw new Error(message);
}

/** Run `fn` with console.error silenced, returning everything it logged. */
function captureErrors(fn: () => void): string[] {
  const original = console.error;
  const logged: string[] = [];
  console.error = (...args: unknown[]) => {
    logged.push(args.map(String).join(' '));
  };
  try {
    fn();
  } finally {
    console.error = original;
  }
  return logged;
}

// --- Delivery -------------------------------------------------------------

function test_publish_delivers_payload() {
  const bus = new EventBus();
  const seen: unknown[] = [];
  bus.subscribe('clipboard.changed', (payload) => seen.push(payload));

  const payload = { id: '123', content: 'test', content_type: 'text', timestamp: 1 };
  bus.publish('clipboard.changed', payload);

  assert(seen.length === 1, `handler should be called once, got ${seen.length}`);
  assert(seen[0] === payload, 'payload should pass through by reference');
}

function test_publish_forwards_multiple_args() {
  const bus = new EventBus();
  let received: unknown[] = [];
  bus.subscribe('multi', (...args) => (received = args));

  bus.publish('multi', 1, 'two', { three: 3 });

  assert(received.length === 3, `expected 3 args, got ${received.length}`);
  assert(received[0] === 1 && received[1] === 'two', 'args should be forwarded in order');
}

function test_all_handlers_receive_event() {
  const bus = new EventBus();
  let a = 0;
  let b = 0;
  bus.subscribe('tick', () => a++);
  bus.subscribe('tick', () => b++);

  bus.publish('tick');

  assert(a === 1 && b === 1, `both handlers should fire, got a=${a} b=${b}`);
}

function test_publish_unknown_event_is_noop() {
  const bus = new EventBus();
  bus.publish('never.subscribed', 'payload');
  assert(true, 'publishing an unknown event must not throw');
}

function test_events_are_isolated() {
  const bus = new EventBus();
  let hits = 0;
  bus.subscribe('a', () => hits++);

  bus.publish('b');

  assert(hits === 0, 'a handler for "a" must not receive "b"');
}

// --- Unsubscribe ----------------------------------------------------------

function test_unsubscribe_stops_delivery() {
  const bus = new EventBus();
  let count = 0;
  const unsub = bus.subscribe('clipboard.changed', () => count++);

  bus.publish('clipboard.changed');
  assert(count === 1, `handler should fire once, got ${count}`);

  unsub();
  bus.publish('clipboard.changed');
  assert(count === 1, `handler must not fire after unsubscribe, got ${count}`);
}

function test_unsubscribe_is_idempotent() {
  const bus = new EventBus();
  const unsub = bus.subscribe('x', () => {});
  unsub();
  unsub(); // must not throw
  assert(true, 'calling unsubscribe twice must not throw');
}

function test_unsubscribe_one_keeps_others() {
  const bus = new EventBus();
  let kept = 0;
  let dropped = 0;
  const unsubDropped = bus.subscribe('x', () => dropped++);
  bus.subscribe('x', () => kept++);

  unsubDropped();
  bus.publish('x');

  assert(dropped === 0, 'unsubscribed handler must not fire');
  assert(kept === 1, `remaining handler should still fire, got ${kept}`);
}

// --- Error isolation ------------------------------------------------------

function test_throwing_handler_does_not_break_others() {
  const bus = new EventBus();
  let reached = 0;
  bus.subscribe('error.test', () => {
    throw new Error('handler error');
  });
  bus.subscribe('error.test', () => reached++);

  const logged = captureErrors(() => bus.publish('error.test'));

  assert(reached === 1, `second handler should still run, got ${reached}`);
  assert(
    logged.some((line) => line.includes('error.test')),
    'the swallowed error should be reported with the event name',
  );
}

function test_throwing_handler_does_not_break_publish_call() {
  const bus = new EventBus();
  bus.subscribe('boom', () => {
    throw new Error('boom');
  });

  captureErrors(() => bus.publish('boom'));
  assert(true, 'publish must not rethrow handler errors');
}

// --- clear() --------------------------------------------------------------

function test_clear_removes_all_listeners() {
  const bus = new EventBus();
  let hits = 0;
  bus.subscribe('a', () => hits++);
  bus.subscribe('b', () => hits++);

  bus.clear();
  bus.publish('a');
  bus.publish('b');

  assert(hits === 0, `no handler should fire after clear(), got ${hits}`);
}

function test_subscribe_after_clear_still_works() {
  const bus = new EventBus();
  bus.clear();
  let hits = 0;
  bus.subscribe('a', () => hits++);

  bus.publish('a');

  assert(hits === 1, 'the bus must remain usable after clear()');
}

function test_clear_is_idempotent() {
  const bus = new EventBus();
  bus.clear();
  bus.clear();
  assert(true, 'clear() twice must not throw');
}

// --- Set semantics --------------------------------------------------------

function test_same_handler_registered_once() {
  const bus = new EventBus();
  let hits = 0;
  const handler = () => hits++;

  bus.subscribe('x', handler);
  bus.subscribe('x', handler);
  bus.publish('x');

  assert(hits === 1, `a duplicate handler should fire once (Set semantics), got ${hits}`);
}

// --- Singleton ------------------------------------------------------------

function test_global_bus_is_an_event_bus() {
  assert(globalEventBus instanceof EventBus, 'globalEventBus should be an EventBus');
}

function test_global_bus_is_usable() {
  const bus = new EventBus();
  let hits = 0;
  const unsub = globalEventBus.subscribe('global.test', () => hits++);
  try {
    globalEventBus.publish('global.test');
    assert(hits === 1, 'globalEventBus should deliver events');
  } finally {
    unsub();
  }
  assert(bus instanceof EventBus, 'sanity: local instances are independent');
}

function main() {
  const tests = [
    test_publish_delivers_payload,
    test_publish_forwards_multiple_args,
    test_all_handlers_receive_event,
    test_publish_unknown_event_is_noop,
    test_events_are_isolated,
    test_unsubscribe_stops_delivery,
    test_unsubscribe_is_idempotent,
    test_unsubscribe_one_keeps_others,
    test_throwing_handler_does_not_break_others,
    test_throwing_handler_does_not_break_publish_call,
    test_clear_removes_all_listeners,
    test_subscribe_after_clear_still_works,
    test_clear_is_idempotent,
    test_same_handler_registered_once,
    test_global_bus_is_an_event_bus,
    test_global_bus_is_usable,
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
