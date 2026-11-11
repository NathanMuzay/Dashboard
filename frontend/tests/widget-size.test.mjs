import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

// Simule le navigateur pour vérifier les seuils et le cycle de vie de l'observateur.
test('les tailles compactes suivent les pixels réels et se rétablissent après agrandissement', async () => {
  let effect, resize, disconnected = false;
  let bounds = { width: 480, height: 272 };
  const element = { dataset: {}, getBoundingClientRect: () => bounds };
  const source = await readFile(new URL('../src/hooks/useWidgetSize.js', import.meta.url), 'utf8');
  const context = vm.createContext({
    useRef: () => ({ current: element }),
    useLayoutEffect: callback => { effect = callback; },
    ResizeObserver: class {
      constructor(callback) { resize = callback; }
      observe(target, options) {
        assert.equal(target, element);
        assert.equal(options.box, 'border-box');
      }
      disconnect() { disconnected = true; }
    },
  });
  vm.runInContext(source.replace(/^import .*;\n/, '').replace('export default ', ''), context);
  context.useWidgetSize();
  const cleanup = effect();
  for (const [width, height, expectedWidth, expectedHeight] of [
    [480, 272, 'wide', 'tall'], [299, 239, 'narrow', 'short'],
    [179, 159, 'tiny', 'flat'], [180, 160, 'narrow', 'short'],
    [300, 240, 'wide', 'tall'], [480, 128, 'wide', 'flat'],
    [120, 600, 'tiny', 'tall'], [600, 416, 'wide', 'tall'],
  ]) {
    bounds = { width, height };
    resize();
    assert.equal(element.dataset.width, expectedWidth);
    assert.equal(element.dataset.height, expectedHeight);
  }
  cleanup();
  assert.equal(disconnected, true);
});
