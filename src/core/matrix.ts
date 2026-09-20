/**
 * Minimal 3x3 matrix maths, enough to derive colour transforms from their
 * forward definitions rather than transcribing published inverses by hand.
 * Row-major, flat.
 */
export type Mat3 = readonly [
  number, number, number,
  number, number, number,
  number, number, number,
];

export function multiply(a: Mat3, b: Mat3): Mat3 {
  const out = new Array<number>(9);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      out[r * 3 + c] =
        a[r * 3]! * b[c]! + a[r * 3 + 1]! * b[3 + c]! + a[r * 3 + 2]! * b[6 + c]!;
    }
  }
  return out as unknown as Mat3;
}

export function determinant(m: Mat3): number {
  return (
    m[0] * (m[4] * m[8] - m[5] * m[7]) -
    m[1] * (m[3] * m[8] - m[5] * m[6]) +
    m[2] * (m[3] * m[7] - m[4] * m[6])
  );
}

export function invert(m: Mat3): Mat3 {
  const det = determinant(m);
  if (Math.abs(det) < 1e-12) throw new Error('Matrix is not invertible');
  const d = 1 / det;
  return [
    (m[4] * m[8] - m[5] * m[7]) * d,
    (m[2] * m[7] - m[1] * m[8]) * d,
    (m[1] * m[5] - m[2] * m[4]) * d,
    (m[5] * m[6] - m[3] * m[8]) * d,
    (m[0] * m[8] - m[2] * m[6]) * d,
    (m[2] * m[3] - m[0] * m[5]) * d,
    (m[3] * m[7] - m[4] * m[6]) * d,
    (m[1] * m[6] - m[0] * m[7]) * d,
    (m[0] * m[4] - m[1] * m[3]) * d,
  ];
}

export function apply(m: Mat3, x: number, y: number, z: number): [number, number, number] {
  return [
    m[0] * x + m[1] * y + m[2] * z,
    m[3] * x + m[4] * y + m[5] * z,
    m[6] * x + m[7] * y + m[8] * z,
  ];
}
