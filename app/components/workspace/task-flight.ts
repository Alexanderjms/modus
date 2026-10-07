const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";
const CURSOR =
  '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M5 3l14 7-6 2-2 6z" fill="var(--foreground)" stroke="var(--surface)" stroke-width="1.5" stroke-linejoin="round"/></svg>';

export function pointAtTask(taskId: number, from: DOMRect) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const deadline = performance.now() + 3000;

  const wait = () => {
    const target = document.querySelector<HTMLElement>(`[data-task-id="${taskId}"]`);
    if (!target) {
      if (performance.now() < deadline) requestAnimationFrame(wait);
      return;
    }
    target.scrollIntoView({ block: "nearest", inline: "nearest" });
    const to = target.getBoundingClientRect();
    if (!to.width || !to.height) return;

    const cursor = document.createElement("div");
    cursor.innerHTML = CURSOR;
    cursor.setAttribute("aria-hidden", "true");
    cursor.style.cssText =
      "position:fixed;z-index:1000;pointer-events:none;left:-5px;top:-3px;filter:drop-shadow(0 2px 4px #0003)";
    document.body.append(cursor);

    const startX = from.left + from.width / 2;
    const startY = from.top + from.height / 2;
    const endX = to.left + to.width * 0.55;
    const endY = to.top + to.height * 0.5;
    const done = () => cursor.remove();
    cursor
      .animate(
        [
          { transform: `translate(${startX}px, ${startY}px)`, opacity: 0 },
          { transform: `translate(${startX}px, ${startY}px)`, opacity: 1, offset: 0.1 },
          { transform: `translate(${endX}px, ${endY}px)`, opacity: 1, offset: 0.6 },
          { transform: `translate(${endX}px, ${endY}px)`, opacity: 1, offset: 0.9 },
          { transform: `translate(${endX}px, ${endY}px)`, opacity: 0 },
        ],
        { duration: 1500, easing: EASE },
      )
      .finished.then(done, done);
    target.animate(
      [
        { boxShadow: "0 0 0 0 #007aff00" },
        { boxShadow: "0 0 0 3px #007aff66", offset: 0.5 },
        { boxShadow: "0 0 0 0 #007aff00" },
      ],
      { duration: 900, delay: 700, easing: EASE },
    );
  };
  requestAnimationFrame(wait);
}

export function flyTaskToBoard(taskId: number, from: DOMRect) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const deadline = performance.now() + 3000;

  const wait = () => {
    const target = document.querySelector<HTMLElement>(`[data-task-id="${taskId}"]`);
    if (!target) {
      if (performance.now() < deadline) requestAnimationFrame(wait);
      return;
    }
    target.scrollIntoView({ block: "nearest", inline: "nearest" });
    const to = target.getBoundingClientRect();
    if (!to.width || !to.height) return;

    const ghost = document.createElement("div");
    const clone = target.cloneNode(true) as HTMLElement;
    clone.removeAttribute("data-task-id");
    clone.removeAttribute("data-entering");
    clone.style.cssText = "margin:0;width:100%;height:100%;animation:none;pointer-events:none";
    const cursor = document.createElement("div");
    cursor.innerHTML = CURSOR;
    cursor.style.cssText = "position:absolute;left:50%;top:14px;filter:drop-shadow(0 2px 4px #0003)";
    ghost.append(clone, cursor);
    ghost.setAttribute("aria-hidden", "true");
    ghost.style.cssText = `position:fixed;z-index:1000;pointer-events:none;transform-origin:0 0;left:${to.left}px;top:${to.top}px;width:${to.width}px;height:${to.height}px`;
    document.body.append(ghost);
    target.style.visibility = "hidden";

    const scale = Math.min(1, from.width / to.width);
    const startX = from.left + (from.width - to.width * scale) / 2 - to.left;
    const startY = from.top + (from.height - to.height * scale) / 2 - to.top;
    const done = () => {
      target.style.visibility = "";
      ghost.remove();
    };
    ghost
      .animate(
        [
          { transform: `translate(${startX}px, ${startY}px) scale(${scale})`, opacity: 0 },
          { transform: `translate(${startX}px, ${startY}px) scale(${scale})`, opacity: 1, offset: 0.12 },
          { transform: "translate(0, 0) scale(1)", opacity: 1 },
        ],
        { duration: 800, easing: EASE },
      )
      .finished.then(done, done);
    cursor
      .animate([{ opacity: 1 }, { opacity: 1, offset: 0.85 }, { opacity: 0 }], { duration: 800 });
  };
  requestAnimationFrame(wait);
}
