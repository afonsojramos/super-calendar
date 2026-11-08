export type EventGrab = {
  readonly box: HTMLElement;
  readonly pointerId: number;
  readonly pointerType: string;
  readonly clientX: number;
  readonly clientY: number;
};

export function waitForHold(
  grab: EventGrab,
  delay: number,
  threshold: number,
  onHold: () => void,
  onTap: () => void,
  onCancel: () => void,
): () => void {
  const detach = () => {
    clearTimeout(timer);
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", up);
    document.removeEventListener("pointercancel", cancelPointer);
    document.removeEventListener("pointerdown", anotherPointer);
  };
  const cancel = () => {
    detach();
    onCancel();
  };
  const move = (event: PointerEvent) => {
    if (
      event.pointerId === grab.pointerId &&
      Math.hypot(event.clientX - grab.clientX, event.clientY - grab.clientY) > threshold
    ) {
      cancel();
    }
  };
  const up = (event: PointerEvent) => {
    if (event.pointerId === grab.pointerId) {
      detach();
      onTap();
    }
  };
  const cancelPointer = (event: PointerEvent) => {
    if (event.pointerId === grab.pointerId) {
      cancel();
    }
  };
  const anotherPointer = (event: PointerEvent) => {
    if (event.pointerId !== grab.pointerId) {
      cancel();
    }
  };
  const timer = setTimeout(() => {
    detach();
    onHold();
  }, delay);
  document.addEventListener("pointermove", move);
  document.addEventListener("pointerup", up);
  document.addEventListener("pointercancel", cancelPointer);
  document.addEventListener("pointerdown", anotherPointer);
  return cancel;
}

/** A quick swipe scrolls; a held pointer owns a date-row drag until release. */
export function holdDateDrag(
  grab: EventGrab,
  start: () => void,
  move: (clientX: number, clientY: number) => void,
  cancel: () => void,
  release: () => void,
): () => void {
  const doc = grab.box.ownerDocument;
  let active = false;
  let finished = false;
  let cancelWait: (() => void) | undefined;
  const detach = () => {
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
    cancelWait?.();
    cancel();
    release();
  };
  const onMove = (event: PointerEvent) => {
    if (active && event.pointerId === grab.pointerId) move(event.clientX, event.clientY);
  };
  const onUp = (event: PointerEvent) => {
    if (event.pointerId !== grab.pointerId) return;
    finished = true;
    detach();
    release();
    // The view's window pointerup handler commits the current range.
  };
  const onCancel = (event: PointerEvent) => {
    if (event.pointerId === grab.pointerId) stop();
  };
  const onAnotherPointer = (event: PointerEvent) => {
    if (event.pointerId !== grab.pointerId) stop();
  };
  const onTouchMove = (event: TouchEvent) => {
    if (active && event.cancelable) event.preventDefault();
  };
  const onContextMenu = (event: Event) => {
    event.preventDefault();
  };
  doc.addEventListener("pointermove", onMove);
  doc.addEventListener("pointerup", onUp);
  doc.addEventListener("pointercancel", onCancel);
  doc.addEventListener("pointerdown", onAnotherPointer);
  doc.addEventListener("touchmove", onTouchMove, { passive: false });
  doc.addEventListener("contextmenu", onContextMenu);
  cancelWait = waitForHold(
    grab,
    400,
    8,
    () => {
      active = true;
      start();
    },
    release,
    stop,
  );
  return stop;
}
