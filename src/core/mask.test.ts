import { describe, expect, it } from 'vitest';
import { coverage, pill, rasterizeMask, signedDistance } from './mask.ts';

const square = { x: 10, y: 10, width: 100, height: 100, radius: 0 };
const rounded = { ...square, radius: 22.5 };

describe('signedDistance', () => {
  it('is negative inside and positive outside', () => {
    expect(signedDistance(square, 60, 60)).toBeLessThan(0);
    expect(signedDistance(square, 200, 60)).toBeGreaterThan(0);
  });

  it('measures the true distance to a square edge', () => {
    expect(signedDistance(square, 120, 60)).toBeCloseTo(10, 6);
    expect(signedDistance(square, 60, 0)).toBeCloseTo(10, 6);
  });

  it('cuts the corner when there is a radius', () => {
    // The square's corner is inside; the rounded one's is not.
    expect(signedDistance(square, 11, 11)).toBeLessThan(0);
    expect(signedDistance(rounded, 11, 11)).toBeGreaterThan(0);
  });

  it('clamps a radius larger than the shape', () => {
    const circle = { x: 0, y: 0, width: 20, height: 20, radius: 1000 };
    expect(signedDistance(circle, 10, 10)).toBeCloseTo(-10, 6);
  });
});

describe('coverage', () => {
  it('is fully on inside and fully off outside', () => {
    expect(coverage(rounded, 60, 60)).toBe(1);
    expect(coverage(rounded, 300, 300)).toBe(0);
  });

  it('is partial across the edge', () => {
    const onEdge = coverage(square, 109, 60);
    expect(onEdge).toBeGreaterThan(0);
    expect(onEdge).toBeLessThanOrEqual(1);
    expect(coverage(square, 110, 60)).toBeLessThan(onEdge);
  });
});

describe('pill', () => {
  it('rounds by half its shorter side', () => {
    expect(pill(0, 0, 80, 40).radius).toBe(20);
    expect(pill(0, 0, 40, 80).radius).toBe(20);
  });

  it('makes a circle from a square', () => {
    const circle = pill(0, 0, 40, 40);
    expect(signedDistance(circle, 20, 20)).toBeCloseTo(-20, 6);
    // A corner of the bounding box is outside a circle inscribed in it.
    expect(signedDistance(circle, 1, 1)).toBeGreaterThan(0);
  });
});

describe('rasterizeMask', () => {
  it('rounds the corners of a single shape', () => {
    const mask = rasterizeMask(40, 40, [{ x: 0, y: 0, width: 40, height: 40, radius: 9 }]);
    expect(mask[20 * 40 + 20]).toBe(1);
    expect(mask[0]).toBe(0);
    expect(mask[39]).toBe(0);
    expect(mask[39 * 40]).toBe(0);
    expect(mask[39 * 40 + 39]).toBe(0);
  });

  it('unions shapes rather than adding them', () => {
    const shapes = [
      { x: 0, y: 0, width: 20, height: 20, radius: 0 },
      { x: 10, y: 0, width: 20, height: 20, radius: 0 },
    ];
    const mask = rasterizeMask(40, 20, shapes);
    // The overlap is covered exactly once, not twice.
    expect(mask[10 * 40 + 15]).toBe(1);
    expect(mask[10 * 40 + 5]).toBe(1);
    expect(mask[10 * 40 + 25]).toBe(1);
    expect(mask[10 * 40 + 35]).toBe(0);
    expect(Math.max(...mask)).toBe(1);
  });

  it('leaves everything off when there are no shapes', () => {
    expect(Math.max(...rasterizeMask(8, 8, []))).toBe(0);
  });
});
