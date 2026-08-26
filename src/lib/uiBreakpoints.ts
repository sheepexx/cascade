/**
 * Interface scale grows every rem-sized control, but CSS media queries always
 * measure raw viewport pixels and ignore the root font size. A header that
 * fits at 100% therefore overflows at 130% while `xl:` still reports plenty of
 * room. Dividing the viewport by the scale gives the width the layout really
 * has to work with, and the `uimd:`/`uilg:`/`uixl:` Tailwind variants key off the
 * resulting attributes instead of the viewport.
 */
export const UI_BREAKPOINTS = {
  uimd: 900,
  uilg: 1024,
  uixl: 1280,
} as const;

export type UiBreakpoint = keyof typeof UI_BREAKPOINTS;

export function effectiveViewportWidth(
  viewportWidth: number,
  uiScale: number,
): number {
  const safeScale = Number.isFinite(uiScale) && uiScale > 0 ? uiScale : 1;
  const safeWidth =
    Number.isFinite(viewportWidth) && viewportWidth > 0 ? viewportWidth : 0;
  return safeWidth / safeScale;
}

export function activeUiBreakpoints(
  viewportWidth: number,
  uiScale: number,
): Record<UiBreakpoint, boolean> {
  const width = effectiveViewportWidth(viewportWidth, uiScale);
  return {
    uimd: width >= UI_BREAKPOINTS.uimd,
    uilg: width >= UI_BREAKPOINTS.uilg,
    uixl: width >= UI_BREAKPOINTS.uixl,
  };
}

/** Just the surface these helpers need, so they are testable without a DOM. */
export type BreakpointTarget = Pick<
  Element,
  "setAttribute" | "removeAttribute"
>;

/** Mirrors the active breakpoints onto `<html>` as `data-uimd`/`data-uilg`/`data-uixl`. */
export function syncUiBreakpointAttributes(
  root: BreakpointTarget,
  viewportWidth: number,
  uiScale: number,
): void {
  const active = activeUiBreakpoints(viewportWidth, uiScale);
  for (const name of Object.keys(active) as UiBreakpoint[]) {
    if (active[name]) root.setAttribute(`data-${name}`, "");
    else root.removeAttribute(`data-${name}`);
  }
}

export function clearUiBreakpointAttributes(root: BreakpointTarget): void {
  for (const name of Object.keys(UI_BREAKPOINTS) as UiBreakpoint[]) {
    root.removeAttribute(`data-${name}`);
  }
}
