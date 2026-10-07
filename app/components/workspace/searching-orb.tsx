import styles from "./searching-orb.module.css";

const N = 3;
const PITCH = 6;
const STEPS = N * 2 - 1;

const CELLS = (() => {
  const cells: { key: string; left: number; top: number; delay: number }[] = [];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      cells.push({
        key: x + "," + y,
        left: x * PITCH,
        top: y * PITCH,
        delay: -(((STEPS - (x + y)) / STEPS) * 1400),
      });
    }
  }
  return cells;
})();

export function SearchingOrb() {
  return (
    <span className={styles.glyph} role="img" aria-label="Searching…">
      <span className={styles.lattice}>
        {CELLS.map((cell) => (
          <span
            key={cell.key}
            className={styles.cell}
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
