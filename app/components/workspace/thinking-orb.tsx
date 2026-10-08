"use client";

import styles from "./thinking-orb.module.css";
import { useT } from "../../i18n/provider";

const N = 3;
const PITCH = 6;

const RING: [number, number][] = (() => {
  const ring: [number, number][] = [];
  for (let x = 0; x < N; x++) ring.push([x, 0]);
  for (let y = 1; y < N; y++) ring.push([N - 1, y]);
  for (let x = N - 2; x >= 0; x--) ring.push([x, N - 1]);
  for (let y = N - 2; y >= 1; y--) ring.push([0, y]);
  return ring;
})();

const RING_INDEX = new Map(RING.map(([x, y], i) => [x + "," + y, i]));

const CELLS = (() => {
  const cells: {
    key: string;
    left: number;
    top: number;
    delay: number;
    still: boolean;
    mid: boolean;
  }[] = [];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const ringIndex = RING_INDEX.get(x + "," + y);
      cells.push({
        key: x + "," + y,
        left: x * PITCH,
        top: y * PITCH,
        delay:
          ringIndex === undefined
            ? 0
            : -(((RING.length - ringIndex) % RING.length) / RING.length) * 1700,
        still: ringIndex === undefined,
        mid: x === 1 && y === 1,
      });
    }
  }
  return cells;
})();

export function ThinkingOrb() {
  const t = useT();
  return (
    <span className={styles.glyph} role="img" aria-label={t("Pensando…")}>
      <span className={styles.lattice}>
        {CELLS.map((cell) => (
          <span
            key={cell.key}
            className={styles.cell}
            data-still={cell.still ? "" : undefined}
            data-mid={cell.mid ? "" : undefined}
            style={{
              left: cell.left,
              top: cell.top,
              animationDelay: `${cell.delay}ms`,
            }}
          />
        ))}
      </span>
    </span>
  );
}
