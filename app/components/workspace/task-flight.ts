const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";
const CURSOR_SVG =
  '<svg viewBox="0 0 24 24" width="34" height="34" aria-hidden="true"><path d="M5 3l14 7-6 2-2 6z" fill="#ffffff" stroke="#1d1d1f" stroke-width="1.6" stroke-linejoin="round"/></svg>';

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function createCursor(position: string) {
  const cursor = document.createElement("div");
  cursor.setAttribute("aria-hidden", "true");
  cursor.style.cssText = `${position};pointer-events:none;filter:drop-shadow(0 3px 6px #00000066)`;
  cursor.innerHTML = `<div style="position:relative;left:-7px;top:-4px">${CURSOR_SVG}<span style="position:absolute;left:24px;top:26px;padding:2px 8px;border-radius:999px;background:#007aff;color:#fff;font:700 11px/16px system-ui,sans-serif;box-shadow:0 0 0 2px #fff">IA</span></div>`;
  return cursor;
}

function waitForTask(taskId: number, onFound: (target: HTMLElement) => void) {
  const deadline = performance.now() + 4000;
  const check = () => {
    const target = document.querySelector<HTMLElement>(`[data-task-id="${taskId}"]`);
    if (target) return onFound(target);
    if (performance.now() < deadline) requestAnimationFrame(check);
  };
  requestAnimationFrame(check);
}

export function pointAtTask(taskId: number, from: DOMRect) {
  if (reducedMotion()) return;
  waitForTask(taskId, (target) => {
    target.scrollIntoView({ block: "nearest", inline: "nearest" });
    const to = target.getBoundingClientRect();
    if (!to.width || !to.height) return;

    const cursor = createCursor("position:fixed;z-index:1000;left:0;top:0");
    document.body.append(cursor);

    const startX = from.left + from.width / 2;
    const startY = from.top + from.height / 2;
    const endX = to.left + to.width * 0.55;
    const endY = to.top + to.height * 0.5;
    const at = (x: number, y: number, scale = 1) => `translate(${x}px, ${y}px) scale(${scale})`;
    const done = () => cursor.remove();
    cursor
      .animate(
        [
          { transform: at(startX, startY), opacity: 0 },
          { transform: at(startX, startY), opacity: 1, offset: 0.08 },
          { transform: at(startX, startY), opacity: 1, offset: 0.14, easing: EASE },
          { transform: at(endX, endY), opacity: 1, offset: 0.56 },
          { transform: at(endX, endY, 0.82), opacity: 1, offset: 0.62 },
          { transform: at(endX, endY), opacity: 1, offset: 0.7 },
          { transform: at(endX, endY), opacity: 1, offset: 0.92 },
          { transform: at(endX, endY), opacity: 0 },
        ],
        { duration: 3000 },
      )
      .finished.then(done, done);
    target.animate(
      [
        { boxShadow: "0 0 0 0 #007aff00" },
        { boxShadow: "0 0 0 5px #007aff80", offset: 0.45 },
        { boxShadow: "0 0 0 0 #007aff00" },
      ],
      { duration: 1000, delay: 1800, iterations: 2, easing: EASE },
    );
  });
}

export function flyTaskToBoard(taskId: number, from: DOMRect) {
  if (reducedMotion()) return;
  waitForTask(taskId, (target) => {
    target.scrollIntoView({ block: "nearest", inline: "nearest" });
    const to = target.getBoundingClientRect();
    if (!to.width || !to.height) return;

    const ghost = document.createElement("div");
    const clone = target.cloneNode(true) as HTMLElement;
    clone.removeAttribute("data-task-id");
    clone.removeAttribute("data-entering");
    clone.style.cssText = "margin:0;width:100%;height:100%;animation:none;pointer-events:none;box-shadow:0 10px 26px #00000040";
    const cursor = createCursor("position:absolute;left:50%;top:14px");
    ghost.append(clone, cursor);
    ghost.setAttribute("aria-hidden", "true");
    ghost.style.cssText = `position:fixed;z-index:1000;pointer-events:none;transform-origin:0 0;left:${to.left}px;top:${to.top}px;width:${to.width}px;height:${to.height}px`;
    document.body.append(ghost);
    target.style.visibility = "hidden";

    const scale = Math.min(1, from.width / to.width);
    const startX = from.left + (from.width - to.width * scale) / 2 - to.left;
    const startY = from.top + (from.height - to.height * scale) / 2 - to.top;
    const at = (x: number, y: number, s: number) => `translate(${x}px, ${y}px) scale(${s})`;
    const done = () => {
      target.style.visibility = "";
      ghost.remove();
    };
    ghost
      .animate(
        [
          { transform: at(startX, startY, scale), opacity: 0 },
          { transform: at(startX, startY, scale), opacity: 1, offset: 0.1 },
          { transform: at(startX, startY, scale * 1.04), opacity: 1, offset: 0.2, easing: EASE },
          { transform: at(0, 0, 1.03), opacity: 1, offset: 0.88 },
          { transform: at(0, 0, 1), opacity: 1 },
        ],
        { duration: 2000 },
      )
      .finished.then(done, done);
    cursor.animate([{ opacity: 1 }, { opacity: 1, offset: 0.9 }, { opacity: 0 }], { duration: 2000 });
  });
}
