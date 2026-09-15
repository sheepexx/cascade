/**
 * The text of the paste a Ctrl/Cmd+V keydown is about to start, read without a
 * clipboard permission prompt. Call it from that keydown, outside any text
 * field, and leave the default alone: focus moves to a hidden text field for
 * the moment of the paste, since WebKit only fires paste where something is
 * editable, then goes back. Resolves null when no paste arrives in time.
 */
export function catchPastedText(timeoutMs = 150): Promise<string | null> {
  if (typeof document === "undefined") return Promise.resolve(null);
  const previous = document.activeElement as HTMLElement | null;
  const catcher = document.createElement("textarea");
  catcher.setAttribute("aria-hidden", "true");
  catcher.tabIndex = -1;
  catcher.style.cssText =
    "position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;";
  document.body.appendChild(catcher);
  catcher.focus({ preventScroll: true });

  return new Promise((resolve) => {
    const finish = (text: string | null) => {
      window.clearTimeout(timer);
      catcher.removeEventListener("paste", onPaste);
      const hadFocus = document.activeElement === catcher;
      catcher.remove();
      if (hadFocus && previous?.isConnected && previous !== document.body) {
        previous.focus({ preventScroll: true });
      }
      resolve(text);
    };
    const onPaste = (e: ClipboardEvent) => {
      e.preventDefault();
      finish(e.clipboardData?.getData("text/plain") ?? "");
    };
    catcher.addEventListener("paste", onPaste);
    // A paste that arrives later finds the field gone and does nothing, so the
    // caller's fallback can never run twice.
    const timer = window.setTimeout(() => finish(null), timeoutMs);
  });
}
