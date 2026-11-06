/** Keep quick swipes scrollable, then let a held pointer own the date-row drag. */
export function holdWebDateDrag(
  node: HTMLElement,
  pointer: { pointerId: number; clientX: number; clientY: number },
  start: () => void,
  move: (x: number, y: number) => void,
  cancel: () => void,
  release: () => void,
): () => void {
  const doc = node.ownerDocument;
  let active = false;
  let finished = false;
  const detach = () => {
    clearTimeout(timer);
    doc.removeEventListener("pointermove", onMove);
    doc.removeEventListener("pointerup", onUp);
    doc.removeEventListener("pointercancel", onCancel);
    doc.removeEventListener("pointerdown", onAnotherPointer);
    doc.removeEventListener("touchmove", onTouchMove);
    doc.removeEventListener("contextmenu", onContextMenu);
  };
  const stop = () => {
    if (finished) return;
    finished = true;
    detach();
    cancel();
    release();
  };
  const onMove = (event: PointerEvent) => {
    if (event.pointerId !== pointer.pointerId) return;
    if (active) move(event.clientX, event.clientY);
    else if (Math.hypot(event.clientX - pointer.clientX, event.clientY - pointer.clientY) > 8)
      stop();
  };
  const onUp = (event: PointerEvent) => {
    if (event.pointerId !== pointer.pointerId) return;
    finished = true;
    detach();
    release();
    // The view's window pointerup listener commits an active drag.
  };
  const onCancel = (event: PointerEvent) => {
    if (event.pointerId === pointer.pointerId) stop();
  };
  const onAnotherPointer = (event: PointerEvent) => {
    if (event.pointerId !== pointer.pointerId) stop();
  };
  const onTouchMove = (event: TouchEvent) => {
    if (active && event.cancelable) event.preventDefault();
  };
  const onContextMenu = (event: Event) => event.preventDefault();
  const timer = setTimeout(() => {
    active = true;
    start();
  }, 400);
  doc.addEventListener("pointermove", onMove);
  doc.addEventListener("pointerup", onUp);
  doc.addEventListener("pointercancel", onCancel);
  doc.addEventListener("pointerdown", onAnotherPointer);
  doc.addEventListener("touchmove", onTouchMove, { passive: false });
  doc.addEventListener("contextmenu", onContextMenu);
  return stop;
}
