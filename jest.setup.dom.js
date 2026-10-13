// jsdom (jest-environment-jsdom) ships no PointerEvent and no pointer-capture
// methods. Polyfill the minimum the /dom components and tests rely on: a
// PointerEvent that carries MouseEvent coordinates, and no-op capture methods.
if (typeof window.PointerEvent === "undefined") {
  window.PointerEvent = class PointerEvent extends MouseEvent {
    pointerId;
    pointerType;
    isPrimary;
    constructor(type, params = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 0;
      this.pointerType = params.pointerType ?? "mouse";
      this.isPrimary = params.isPrimary ?? true;
    }
  };
}
if (!Element.prototype.setPointerCapture) Element.prototype.setPointerCapture = () => {};
if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {};
