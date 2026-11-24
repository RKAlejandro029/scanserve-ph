// QR Model 2, version 6-L, byte mode, mask 0. Outputs vector modules with a four-module quiet zone.
const size = 41;
const dataLength = 136;
const blockLength = 68;
const parityLength = 18;

function multiply(a, b) {
  let result = 0;
  for (let bit = 7; bit >= 0; bit--) {
    result = (result << 1) ^ ((result >>> 7) * 0x11d);
    result ^= ((b >>> bit) & 1) * a;
  }
  return result;
}

function parity(block) {
  const divisor = Array(parityLength).fill(0);
  divisor[parityLength - 1] = 1;
  for (let root = 1, degree = 0; degree < parityLength; degree++, root = multiply(root, 2)) {
    for (let i = 0; i < parityLength; i++) {
      divisor[i] = multiply(divisor[i], root) ^ (divisor[i + 1] || 0);
    }
  }
  const result = Array(parityLength).fill(0);
  for (const value of block) {
    const factor = value ^ result.shift();
    result.push(0);
    divisor.forEach((coefficient, i) => { result[i] ^= multiply(coefficient, factor); });
  }
  return result;
}

export function qrMatrix(text) {
  const input = new TextEncoder().encode(text);
  if (input.length > 134) throw new RangeError('Table URL is too long for the QR code.');
  const bits = [];
  const append = (value, count) => {
    for (let i = count - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  append(4, 4);
  append(input.length, 8);
  input.forEach(byte => append(byte, 8));
  append(0, 4);
  while (bits.length % 8) bits.push(0);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => a * 2 + b, 0));
  for (let pad = 0; data.length < dataLength; pad++) data.push(pad % 2 ? 0x11 : 0xec);
  const first = data.slice(0, blockLength), second = data.slice(blockLength);
  const interleave = (a, b) => a.flatMap((value, i) => [value, b[i]]);
  const codewords = [...interleave(first, second), ...interleave(parity(first), parity(second))];
  const grid = Array.from({ length: size }, () => Array(size).fill(null));
  const put = (x, y, value) => { if (grid[y] && x >= 0 && x < size) grid[y][x] = +value; };
  for (let i = 0; i < size; i++) { put(6, i, i % 2 === 0); put(i, 6, i % 2 === 0); }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) {
      const d = Math.max(Math.abs(x), Math.abs(y));
      put(cx + x, cy + y, d !== 2 && d !== 4);
    }
  }
  for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) {
    put(34 + x, 34 + y, Math.max(Math.abs(x), Math.abs(y)) !== 1);
  }
  const fmt = index => (0x77c4 >>> index) & 1;
  for (let i = 0; i <= 5; i++) put(8, i, fmt(i));
  put(8, 7, fmt(6)); put(8, 8, fmt(7)); put(7, 8, fmt(8));
  for (let i = 9; i < 15; i++) put(14 - i, 8, fmt(i));
  for (let i = 0; i < 8; i++) put(size - 1 - i, 8, fmt(i));
  for (let i = 8; i < 15; i++) put(8, size - 15 + i, fmt(i));
  put(8, size - 8, 1);
  let cursor = 0;
  let up = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right--;
    for (let v = 0; v < size; v++) {
      const y = up ? size - 1 - v : v;
      for (const x of [right, right - 1]) {
        if (grid[y][x] !== null) continue;
        const bit = (codewords[cursor >>> 3] >>> (7 - cursor % 8)) & 1;
        put(x, y, bit ^ +((x + y) % 2 === 0));
        cursor++;
      }
    }
    up = !up;
  }
  return grid;
}

export function qrSVG(text) {
  const grid = qrMatrix(text);
  const path = grid.flatMap((row, y) => row.flatMap((cell, x) => cell ? ['M' + (x + 4) + ' ' + (y + 4) + 'h1v1h-1z'] : [])).join('');
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 49 49" width="392" height="392" shape-rendering="crispEdges"><rect width="49" height="49" fill="white"/><path fill="black" d="' + path + '"/></svg>';
}
