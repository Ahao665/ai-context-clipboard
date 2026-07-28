import { EventBus } from '../src/event-bus';

const bus = new EventBus();
let count = 0;

// Test subscribe + publish
const unsub = bus.subscribe('clipboard.changed', (data) => {
  count++;
  console.assert(data.id === '123', 'payload should pass through');
});
bus.publish('clipboard.changed', { id: '123', content: 'test', content_type: 'text', timestamp: Date.now() });
console.assert(count === 1, 'handler should be called once');

// Test unsubscribe
unsub();
bus.publish('clipboard.changed', { id: '456', content: 'test2', content_type: 'text', timestamp: Date.now() });
console.assert(count === 1, 'handler should not be called after unsubscribe');

// Test error isolation
bus.subscribe('error.test', () => { throw new Error('handler error'); });
bus.subscribe('error.test', () => { count = 100; });
bus.publish('error.test');
console.assert(count === 100, 'error in one handler should not break others');

console.log('✅ EventBus: all tests passed');
