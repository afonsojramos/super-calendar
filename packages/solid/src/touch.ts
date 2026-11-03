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
