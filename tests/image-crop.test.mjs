import test from 'node:test';
import assert from 'node:assert/strict';
import { getCropRect, zoomCropAt, getCropOutputSize } from '../dist/lib/image-crop.js';

const near = (actual, expected, tolerance = 1e-7) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≈ ${expected}`);
const withinImage = (rect, state) => {
  assert.ok(rect.x >= 0 && rect.y >= 0);
  assert.ok(rect.x + rect.width <= state.imageWidth + 1e-7);
  assert.ok(rect.y + rect.height <= state.imageHeight + 1e-7);
  near(rect.width / rect.height, state.aspect);
};

test('initial crop covers the selected aspect without stretching landscape or portrait images', () => {
  const landscape = getCropRect({ imageWidth: 4000, imageHeight: 3000, aspect: 1 });
  assert.deepEqual(landscape, { x: 500, y: 0, width: 3000, height: 3000, centerX: 2000, centerY: 1500 });
  const portrait = getCropRect({ imageWidth: 3000, imageHeight: 4000, aspect: 16 / 9 });
  near(portrait.width, 3000); near(portrait.height, 1687.5);
  near(portrait.x, 0); near(portrait.y, 1156.25);
});

test('panning always keeps the crop within the image, including extreme aspect ratios and zooms', () => {
  for (const aspect of [.25, .75, 1, 16 / 9, 7]) {
    for (const zoom of [0, 1, 2.2, 4, 8]) {
      for (const centerX of [-10000, 500, 10000]) {
        for (const centerY of [-10000, 250, 10000]) {
          const state = { imageWidth: 4000, imageHeight: 3000, aspect, zoom, centerX, centerY };
          const rect = getCropRect(state);
          withinImage(rect, state);
          near(rect.centerX, rect.x + rect.width / 2);
          near(rect.centerY, rect.y + rect.height / 2);
        }
      }
    }
  }
});

test('zoom preserves the source point under the mouse or pinch anchor until an image edge is reached', () => {
  const state = { imageWidth: 4000, imageHeight: 3000, aspect: 4 / 3, zoom: 2, centerX: 2000, centerY: 1500 };
  for (const [anchorX, anchorY] of [[.2, .7], [.5, .5], [0, 1], [1, 0]]) {
    const before = getCropRect(state);
    const next = zoomCropAt(state, 3.4, anchorX, anchorY);
    const after = getCropRect(next);
    near(before.x + before.width * anchorX, after.x + after.width * anchorX);
    near(before.y + before.height * anchorY, after.y + after.height * anchorY);
    withinImage(after, state);
  }
  near(zoomCropAt(state, 10).zoom, 4);
  near(zoomCropAt(state, -1).zoom, 1);
  near(getCropRect({ ...state, zoom: 2.2 }).width, getCropRect({ ...state, zoom: 1 }).width / 2.2);
});

test('export preserves the selected rectangle aspect, caps file dimensions and never upscales', () => {
  for (const kind of ['cover', 'wallpaper']) {
    const limit = kind === 'cover' ? 1800 : 2560;
    for (const rect of [{ width: 8000, height: 3000 }, { width: 2000, height: 7000 }, { width: 301.3, height: 204.9 }]) {
      const out = getCropOutputSize(rect, kind);
      assert.ok(Math.max(out.width, out.height) <= limit);
      assert.ok(out.width <= Math.ceil(rect.width) && out.height <= Math.ceil(rect.height));
      near(out.width / out.height, rect.width / rect.height, .006);
    }
    assert.deepEqual(getCropOutputSize({ width: 300, height: 200 }, kind), { width: 300, height: 200 });
  }
});
