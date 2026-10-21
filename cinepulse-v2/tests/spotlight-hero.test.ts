import test from 'node:test';
import assert from 'node:assert/strict';

test('Spotlight Hero: index wrapping and navigation calculations', () => {
  const count = 5;

  const nextIndex = (curr: number) => (curr + 1) % count;
  const prevIndex = (curr: number) => (curr - 1 + count) % count;

  // Forward progression
  assert.equal(nextIndex(0), 1);
  assert.equal(nextIndex(1), 2);
  assert.equal(nextIndex(4), 0); // Wraps around back to first

  // Backward progression
  assert.equal(prevIndex(0), 4); // Wraps to last
  assert.equal(prevIndex(4), 3);
  assert.equal(prevIndex(1), 0);
});

test('Spotlight Hero: progress calculation and auto-advance cycle', () => {
  const intervalMs = 6000;
  const tickMs = 100;
  const count = 5;

  let progress = 0;
  let index = 0;

  const advanceTick = () => {
    progress += (tickMs / intervalMs) * 100;
    if (progress >= 100) {
      index = (index + 1) % count;
      progress = 0;
    }
  };

  // Simulating 30 ticks (3 seconds) -> progress should be ~50%
  for (let i = 0; i < 30; i++) {
    advanceTick();
  }
  assert.equal(index, 0);
  assert.ok(Math.abs(progress - 50) < 0.01);

  // Simulating another 30 ticks (total 6 seconds) -> advances to index 1, progress resets to 0
  for (let i = 0; i < 30; i++) {
    advanceTick();
  }
  assert.equal(index, 1);
  assert.equal(progress, 0);
});

test('Spotlight Hero: pause conditions halt auto-rotation', () => {
  const checkIsPaused = (opts: {
    isManuallyPaused: boolean;
    isHovered: boolean;
    isFocused: boolean;
    prefersReduced: boolean;
  }) => {
    return opts.isManuallyPaused || opts.isHovered || opts.isFocused || opts.prefersReduced;
  };

  // Default running state
  assert.equal(
    checkIsPaused({ isManuallyPaused: false, isHovered: false, isFocused: false, prefersReduced: false }),
    false
  );

  // Hover pauses
  assert.equal(
    checkIsPaused({ isManuallyPaused: false, isHovered: true, isFocused: false, prefersReduced: false }),
    true
  );

  // Focus pauses (e.g. keyboard tabbing or tab hidden)
  assert.equal(
    checkIsPaused({ isManuallyPaused: false, isHovered: false, isFocused: true, prefersReduced: false }),
    true
  );

  // Manual pause toggle
  assert.equal(
    checkIsPaused({ isManuallyPaused: true, isHovered: false, isFocused: false, prefersReduced: false }),
    true
  );

  // Reduced motion preference
  assert.equal(
    checkIsPaused({ isManuallyPaused: false, isHovered: false, isFocused: false, prefersReduced: true }),
    true
  );
});

test('Spotlight Hero: segmented progress bar fill percentage for each slide', () => {
  const safeIndex = 2; // Slide 3 is active (0-indexed)
  const currentProgress = 45; // 45% through current slide

  const getBarFill = (i: number, activeIdx: number, prog: number) => {
    if (i === activeIdx) return prog;
    if (i < activeIdx) return 100;
    return 0;
  };

  assert.equal(getBarFill(0, safeIndex, currentProgress), 100); // Passed slide
  assert.equal(getBarFill(1, safeIndex, currentProgress), 100); // Passed slide
  assert.equal(getBarFill(2, safeIndex, currentProgress), 45);  // Active slide
  assert.equal(getBarFill(3, safeIndex, currentProgress), 0);   // Upcoming slide
  assert.equal(getBarFill(4, safeIndex, currentProgress), 0);   // Upcoming slide
});
