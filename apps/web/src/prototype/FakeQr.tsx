/* PROTOTYPE ONLY — a deterministic pattern standing in for the QR the real screen draws: it does not scan. */
export function FakeQr({ text }: { text: string }) {
  const cells: boolean[] = [];
  let h = 2166136261;
  for (let i = 0; i < 21 * 21; i++) { h = Math.imul(h ^ text.charCodeAt(i % text.length), 16777619); cells.push(((h >>> 7) & 1) === 1); }
  const finder = (x: number, y: number) => [[0, 0], [14, 0], [0, 14]].some(([fx, fy]) => x >= fx && x < fx + 7 && y >= fy && y < fy + 7 && (x === fx || x === fx + 6 || y === fy || y === fy + 6 || (x >= fx + 2 && x <= fx + 4 && y >= fy + 2 && y <= fy + 4)));
  const inFinder = (x: number, y: number) => [[0, 0], [14, 0], [0, 14]].some(([fx, fy]) => x >= fx && x < fx + 7 && y >= fy && y < fy + 7);
  return (
    <svg className="qr" viewBox="-1 -1 23 23" role="img" aria-label="QR">
      <rect x="-1" y="-1" width="23" height="23" fill="#fff" />
      {cells.map((on, i) => { const x = i % 21, y = Math.floor(i / 21); return (inFinder(x, y) ? finder(x, y) : on) ? <rect key={i} x={x} y={y} width="1" height="1" fill="#1b1d24" /> : null; })}
    </svg>
  );
}

