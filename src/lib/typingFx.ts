import { reduceMotion } from "./performanceMode";

/**
 * Every text field types the osu!lazer way: a typed character drops into
 * place, a deleted one falls out of the field and fades, and the caret glides
 * to where it goes next instead of jumping.
 *
 * A native field cannot animate a single letter, so while one has focus it
 * gets a twin: a copy of its text laid exactly over it, in its font, at its
 * scroll position, inside the same parent (so it shares the field's
 * transforms, opacity and clipping). The field's own glyphs and caret turn
 * transparent while the twin is up; selection, IME, spellcheck underlines,
 * clicks and accessibility all stay with the native field, which still owns
 * the value. On blur the twin goes and the field draws itself again.
 *
 * Fields opt out with data-typing-fx="off" on them or an ancestor. Number,
 * email and password fields are left alone (the first two do not expose a
 * caret position, the last shows no letters), as are touch-only screens,
 * reduced motion and performance mode.
 */

const FIELD_TYPES = new Set(["text", "search", "url", "tel"]);
/** Letters that fall at once at most; the rest just go. */
const MAX_GHOSTS = 48;
/** How far into a long deletion to look for visible letters. */
const MAX_SCAN = 600;
const INSERT_MS = 170;
const GHOST_MS = 480;
const HOST_ATTR = "data-tfx-host";

type Field = HTMLInputElement | HTMLTextAreaElement;
type Run = { text: Text; wrap: HTMLSpanElement | null; anim: Animation | null };

let installed = false;
let session: Session | null = null;

export function installTypingFx(): void {
  if (installed || typeof document === "undefined") return;
  installed = true;
  document.addEventListener("focusin", onFocusIn, true);
  // Bubbling to window runs after React has applied (or refused) a
  // controlled change, so the twin sees the value the field really keeps.
  window.addEventListener("input", onInput);
  document.addEventListener("compositionstart", onCompositionStart, true);
  document.addEventListener("compositionend", onCompositionEnd, true);
  const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  media?.addEventListener?.("change", () => {
    if (reduceMotion()) session?.detach();
  });
}

function isField(target: EventTarget | null): target is Field {
  if (target instanceof HTMLTextAreaElement) {
    if (target.readOnly || target.disabled) return false;
  } else if (target instanceof HTMLInputElement) {
    if (!FIELD_TYPES.has(target.type) || target.readOnly || target.disabled) return false;
    try {
      if (target.matches(":autofill")) return false;
    } catch {
      // Older engines do not know :autofill.
    }
  } else {
    return false;
  }
  return !target.closest('[data-typing-fx="off"]');
}

function touchOnly(): boolean {
  const media = window.matchMedia;
  if (!media) return false;
  return media("(pointer: coarse)").matches && !media("(any-pointer: fine)").matches;
}

function onFocusIn(event: FocusEvent) {
  const target = event.target;
  if (session && session.field === target) return;
  session?.detach();
  if (!isField(target) || reduceMotion() || touchOnly()) return;
  session = Session.attach(target);
}

function onInput(event: Event) {
  if (!session || event.target !== session.field) return;
  session.sync((event as InputEvent).inputType ?? "");
}

function onCompositionStart(event: CompositionEvent) {
  if (session && event.target === session.field) session.suspend();
}

function onCompositionEnd(event: CompositionEvent) {
  if (session && event.target === session.field) session.resume();
}

type Segmenter = {
  segment(text: string): Iterable<{ segment: string; index: number }>;
};
let segmenter: Segmenter | null | undefined;

/** User-perceived characters, so an emoji falls as one piece. */
function graphemes(text: string): { text: string; index: number }[] {
  if (segmenter === undefined) {
    const Ctor = (Intl as unknown as { Segmenter?: new (locale?: string, options?: object) => Segmenter })
      .Segmenter;
    segmenter = Ctor ? new Ctor(undefined, { granularity: "grapheme" }) : null;
  }
  if (segmenter) {
    return Array.from(segmenter.segment(text), (part) => ({ text: part.segment, index: part.index }));
  }
  const out: { text: string; index: number }[] = [];
  let index = 0;
  for (const char of text) {
    out.push({ text: char, index });
    index += char.length;
  }
  return out;
}

const isHigh = (code: number) => code >= 0xd800 && code <= 0xdbff;
const isLow = (code: number) => code >= 0xdc00 && code <= 0xdfff;

/**
 * What changed between two values, as one replaced span: `start`, how many
 * characters went, and what came in. The caret settles the ambiguous cases
 * (typing "l" into "helo" is an insert at 3, not 2).
 */
export function diffText(
  before: string,
  after: string,
  caret: number | null,
): { start: number; removed: number; inserted: string } {
  const most = Math.min(before.length, after.length);
  const tail = caret !== null && caret >= 0 && caret <= after.length ? after.length - caret : -1;
  let suffix =
    tail >= 0 && tail <= most && before.endsWith(after.slice(after.length - tail))
      ? tail
      : commonSuffix(before, after, most);
  let prefix = 0;
  const maxPrefix = most - suffix;
  while (prefix < maxPrefix && before.charCodeAt(prefix) === after.charCodeAt(prefix)) prefix++;
  // Never split a surrogate pair.
  if (prefix > 0 && isHigh(before.charCodeAt(prefix - 1))) prefix--;
  while (suffix > 0 && isLow(after.charCodeAt(after.length - suffix))) suffix--;
  return {
    start: prefix,
    removed: before.length - suffix - prefix,
    inserted: after.slice(prefix, after.length - suffix),
  };
}

function commonSuffix(a: string, b: string, most: number): number {
  let n = 0;
  while (n < most && a.charCodeAt(a.length - 1 - n) === b.charCodeAt(b.length - 1 - n)) n++;
  return n;
}

const TEXT_PROPS = [
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "font-stretch",
  "font-feature-settings",
  "font-variation-settings",
  "font-variant-numeric",
  "font-variant-ligatures",
  "font-variant-caps",
  "font-kerning",
  "font-optical-sizing",
  "letter-spacing",
  "word-spacing",
  "text-transform",
  "text-rendering",
  "text-shadow",
  "line-height",
  "text-align",
  "tab-size",
  "-webkit-font-smoothing",
] as const;

function el(className: string): HTMLSpanElement {
  const node = document.createElement("span");
  node.className = className;
  return node;
}

class Session {
  readonly field: Field;
  private readonly multiline: boolean;
  private readonly root = el("tfx-root");
  private readonly clip = el("tfx-clip");
  private readonly layer = el("tfx-layer");
  private readonly probe = el("tfx-probe");
  private readonly caret = el("tfx-caret");
  private readonly bar = el("tfx-caret-bar");
  private runs: Run[] = [];
  private shown = "";
  private suspended = false;
  private dead = false;
  private frame = 0;
  private ghosts = 0;
  private blink: Animation | null = null;
  private resize: ResizeObserver | null = null;
  private size = { width: 0, height: 0 };
  private box = { bl: 0, bt: 0, br: 0, bb: 0, pl: 0, pr: 0, pt: 0, pb: 0 };
  private left = 0;
  private top = 0;
  private scale = 1;
  private geometryDirty = true;
  private lastScroll = { x: NaN, y: NaN };
  private lastCaret = { x: NaN, y: NaN, h: NaN, hidden: true };

  static attach(field: Field): Session | null {
    const style = getComputedStyle(field);
    if (
      style.position === "fixed" ||
      style.display === "none" ||
      style.direction === "rtl" ||
      style.writingMode !== "horizontal-tb" ||
      !field.parentElement
    ) {
      return null;
    }
    const created = new Session(field, style);
    if (!created.mount(style)) return null;
    return created;
  }

  private constructor(field: Field, style: CSSStyleDeclaration) {
    this.field = field;
    this.multiline = field instanceof HTMLTextAreaElement;
    const root = this.root;
    root.setAttribute("aria-hidden", "true");
    for (const prop of TEXT_PROPS) {
      const value = style.getPropertyValue(prop);
      if (value) root.style.setProperty(prop, value);
    }
    root.style.color = style.color;
    if (style.zIndex !== "auto") root.style.zIndex = style.zIndex;
    // A caret colour the field chose itself is kept; otherwise the accent.
    if (style.caretColor && style.caretColor !== style.color && style.caretColor !== "auto") {
      root.style.setProperty("--tfx-caret", style.caretColor);
    }
    if (this.multiline) {
      this.layer.style.whiteSpace = style.whiteSpace || "pre-wrap";
      this.layer.style.overflowWrap = style.overflowWrap || "break-word";
      this.layer.style.wordBreak = style.wordBreak || "normal";
      this.layer.classList.add("tfx-layer-multi");
    }
    this.probe.textContent = "\u200b";
    this.caret.append(this.bar);
    this.layer.append(this.probe, this.caret);
    this.clip.append(this.layer);
    root.append(this.clip);
  }

  private mount(style: CSSStyleDeclaration): boolean {
    const field = this.field;
    field.insertAdjacentElement("afterend", this.root);
    // The twin must share the field's containing block, or it would sit
    // somewhere else (a field inside a table cell, say).
    if (this.root.offsetParent !== field.offsetParent) {
      this.root.remove();
      return false;
    }
    this.readBox(style);
    this.size = {
      width: parseFloat(style.width) || field.offsetWidth,
      height: parseFloat(style.height) || field.offsetHeight,
    };
    if (typeof ResizeObserver !== "undefined") {
      this.resize = new ResizeObserver((entries) => {
        const entry = entries[0];
        const border = entry?.borderBoxSize?.[0];
        if (border) this.size = { width: border.inlineSize, height: border.blockSize };
        else this.size = { width: field.offsetWidth, height: field.offsetHeight };
        this.readBox(getComputedStyle(field));
        this.geometryDirty = true;
      });
      this.resize.observe(field, { box: "border-box" });
    }
    this.setText(field.value);
    this.layout();
    this.syncScroll();
    this.placeCaret(true);
    // Only now, with the twin drawn in the same frame, hide the field's own
    // glyphs, so focusing never flickers.
    field.setAttribute(HOST_ATTR, "");
    this.blink = this.bar.animate(
      [
        { opacity: 1 },
        { opacity: 1, offset: 0.5 },
        { opacity: 0, offset: 0.62 },
        { opacity: 0, offset: 0.88 },
        { opacity: 1 },
      ],
      { duration: 1060, iterations: Infinity },
    );
    this.frame = requestAnimationFrame(this.tick);
    return true;
  }

  private readBox(style: CSSStyleDeclaration) {
    this.box = {
      bl: parseFloat(style.borderLeftWidth) || 0,
      bt: parseFloat(style.borderTopWidth) || 0,
      br: parseFloat(style.borderRightWidth) || 0,
      bb: parseFloat(style.borderBottomWidth) || 0,
      pl: parseFloat(style.paddingLeft) || 0,
      pr: parseFloat(style.paddingRight) || 0,
      pt: parseFloat(style.paddingTop) || 0,
      pb: parseFloat(style.paddingBottom) || 0,
    };
  }

  private readonly tick = () => {
    if (this.dead) return;
    const field = this.field;
    if (!field.isConnected || document.activeElement !== field) {
      this.detach();
      return;
    }
    if (!this.suspended) {
      if (!field.hasAttribute(HOST_ATTR)) field.setAttribute(HOST_ATTR, "");
      this.layout();
      if (field.value !== this.shown) this.apply(field.value, "");
      this.syncScroll();
      this.placeCaret(false);
    }
    this.frame = requestAnimationFrame(this.tick);
  };

  /** Called on every input event, before the next frame. */
  sync(inputType: string) {
    if (this.dead || this.suspended) return;
    if (this.field.value !== this.shown) this.apply(this.field.value, inputType);
    this.syncScroll();
    this.placeCaret(false);
  }

  suspend() {
    if (this.dead || this.suspended) return;
    // A composition (IME, dead keys) draws its own underlined text; the
    // field shows it natively until it is committed.
    this.suspended = true;
    this.field.removeAttribute(HOST_ATTR);
    this.clip.style.visibility = "hidden";
  }

  resume() {
    if (this.dead || !this.suspended) return;
    this.suspended = false;
    this.setText(this.field.value);
    this.geometryDirty = true;
    this.layout();
    this.syncScroll();
    this.placeCaret(true);
    this.clip.style.visibility = "";
    this.field.setAttribute(HOST_ATTR, "");
  }

  detach() {
    if (this.dead) return;
    this.dead = true;
    cancelAnimationFrame(this.frame);
    this.resize?.disconnect();
    this.blink?.cancel();
    this.field.removeAttribute(HOST_ATTR);
    for (const run of this.runs) run.anim?.cancel();
    this.clip.remove();
    // Letters still falling finish their fall; the rest goes now.
    if (this.ghosts === 0) this.root.remove();
    if (session === this) session = null;
  }

  // Geometry ---------------------------------------------------------------

  private layout() {
    const field = this.field;
    const root = this.root;
    const { bl, bt, br, bb, pl, pr, pt, pb } = this.box;
    const dirty = this.geometryDirty;
    const { width, height } = this.size;
    if (dirty) {
      root.style.width = `${width}px`;
      root.style.height = `${height}px`;
    }
    const rootRect = root.getBoundingClientRect();
    this.scale = rootRect.width > 0 && width > 0 ? rootRect.width / width : 1;
    if (dirty) {
      this.geometryDirty = false;
      const clip = this.clip.style;
      const layer = this.layer.style;
      if (this.multiline) {
        // A textarea scrolls its padding box; the scrollbar is not text.
        // Widths stay fractional so lines wrap exactly where the field's do.
        const scrollbar = Math.max(0, field.offsetWidth - bl - br - field.clientWidth);
        const paddingW = Math.max(0, width - bl - br - scrollbar);
        clip.left = `${bl}px`;
        clip.top = `${bt}px`;
        clip.width = `${paddingW}px`;
        clip.height = `${field.clientHeight}px`;
        layer.left = `${pl}px`;
        layer.top = `${pt}px`;
        layer.width = `${Math.max(0, paddingW - pl - pr)}px`;
      } else {
        // An input clips its text to the content box and centres the line.
        const contentW = Math.max(0, width - bl - br - pl - pr);
        const contentH = Math.max(0, height - bt - bb - pt - pb);
        clip.left = `${bl + pl}px`;
        clip.top = `${bt}px`;
        clip.width = `${contentW}px`;
        clip.height = `${Math.max(0, height - bt - bb)}px`;
        layer.minWidth = `${contentW}px`;
        const lineH = this.layer.getBoundingClientRect().height / this.scale;
        layer.top = `${pt + (contentH - lineH) / 2}px`;
      }
    }
    // Follow the field wherever it sits, to the sub-pixel.
    const fieldRect = field.getBoundingClientRect();
    const dx = (fieldRect.left - rootRect.left) / this.scale;
    const dy = (fieldRect.top - rootRect.top) / this.scale;
    if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
      this.left += dx;
      this.top += dy;
      root.style.left = `${this.left}px`;
      root.style.top = `${this.top}px`;
    }
  }

  private syncScroll() {
    const x = this.field.scrollLeft;
    const y = this.multiline ? this.field.scrollTop : 0;
    if (x === this.lastScroll.x && y === this.lastScroll.y) return;
    this.lastScroll = { x, y };
    this.layer.style.transform = `translate(${-x}px, ${-y}px)`;
  }

  // Text -------------------------------------------------------------------

  private setText(value: string) {
    for (const run of this.runs) {
      run.anim?.cancel();
      (run.wrap ?? run.text).remove();
    }
    this.runs = [];
    if (value) {
      const text = document.createTextNode(value);
      this.layer.insertBefore(text, this.probe);
      this.runs.push({ text, wrap: null, anim: null });
    }
    this.shown = value;
  }

  private apply(next: string, inputType: string) {
    const caret = this.field.selectionEnd;
    const change = diffText(this.shown, next, caret);
    const end = change.start + change.removed;
    this.split(change.start);
    if (change.removed > 0) {
      this.split(end);
      this.dropLetters(change.start, end, inputType.includes("Backward"));
      this.cut(change.start, end);
    }
    if (change.inserted) this.insert(change.start, change.inserted);
    this.shown = next;
    // Anything that went wrong in the bookkeeping is put right at once.
    if (next.length < 4000 && this.runs.map((run) => run.text.data).join("") !== next) {
      this.setText(next);
    }
  }

  /** Makes sure a run starts at `offset`. */
  private split(offset: number) {
    let start = 0;
    for (let i = 0; i < this.runs.length; i++) {
      const run = this.runs[i];
      const len = run.text.data.length;
      if (offset <= start) return;
      if (offset < start + len) {
        if (run.wrap) this.unwrap(run);
        const tail = run.text.splitText(offset - start);
        this.runs.splice(i + 1, 0, { text: tail, wrap: null, anim: null });
        return;
      }
      start += len;
    }
  }

  private cut(from: number, to: number) {
    let start = 0;
    const keep: Run[] = [];
    for (const run of this.runs) {
      const len = run.text.data.length;
      if (start >= from && start + len <= to && len > 0) {
        run.anim?.cancel();
        (run.wrap ?? run.text).remove();
      } else {
        keep.push(run);
      }
      start += len;
    }
    this.runs = keep;
  }

  private insert(offset: number, value: string) {
    let start = 0;
    let index = this.runs.length;
    for (let i = 0; i < this.runs.length; i++) {
      if (start >= offset) {
        index = i;
        break;
      }
      start += this.runs[i].text.data.length;
    }
    const next = this.runs[index];
    const before = next ? (next.wrap ?? next.text) : this.probe;
    const text = document.createTextNode(value);
    const wrap = el("tfx-in");
    wrap.append(text);
    this.layer.insertBefore(wrap, before);
    const run: Run = { text, wrap, anim: null };
    this.runs.splice(index, 0, run);
    // Letters drop in from just above, the way notes land; a paste or a new
    // line only fades, so nothing moves across lines.
    const drop = value.length <= 24 && !value.includes("\n");
    run.anim = wrap.animate(
      drop
        ? [
            { opacity: 0, top: "-0.42em" },
            { opacity: 1, top: "0em" },
          ]
        : [{ opacity: 0 }, { opacity: 1 }],
      { duration: drop ? INSERT_MS : INSERT_MS + 60, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
    );
    run.anim.onfinish = () => {
      if (this.dead || !run.wrap) return;
      this.unwrap(run);
      this.merge(run);
    };
  }

  private unwrap(run: Run) {
    if (!run.wrap) return;
    run.anim?.cancel();
    run.anim = null;
    run.wrap.replaceWith(run.text);
    run.wrap = null;
  }

  /** Joins a settled run with its plain neighbours. */
  private merge(run: Run) {
    let i = this.runs.indexOf(run);
    if (i < 0 || run.wrap) return;
    const prev = this.runs[i - 1];
    if (prev && !prev.wrap) {
      prev.text.appendData(run.text.data);
      run.text.remove();
      this.runs.splice(i, 1);
      i -= 1;
    }
    const here = this.runs[i];
    const after = this.runs[i + 1];
    if (here && after && !after.wrap) {
      here.text.appendData(after.text.data);
      after.text.remove();
      this.runs.splice(i + 1, 1);
    }
  }

  // Measuring --------------------------------------------------------------

  private locate(offset: number, forward: boolean): { run: Run; local: number } | null {
    let start = 0;
    for (const run of this.runs) {
      const len = run.text.data.length;
      if (forward ? offset < start + len : offset <= start + len) {
        return { run, local: offset - start };
      }
      start += len;
    }
    return null;
  }

  /** Screen rects of the characters from `a` to `b`, as drawn at rest. */
  private rects(a: number, b: number): DOMRect[] {
    const from = this.locate(a, true);
    const to = this.locate(b, false);
    if (!from || !to) return [];
    const range = document.createRange();
    range.setStart(from.run.text, from.local);
    range.setEnd(to.run.text, to.local);
    const lift = this.lift(from.run);
    const rects = Array.from(range.getClientRects());
    if (!lift) return rects;
    return rects.map((r) => new DOMRect(r.left, r.top - lift, r.width, r.height));
  }

  /** How far a run that is still dropping in sits from its resting place. */
  private lift(run: Run): number {
    if (!run.wrap || !run.anim) return 0;
    return (parseFloat(getComputedStyle(run.wrap).top) || 0) * this.scale;
  }

  private caretPoint(offset: number): { x: number; y: number; h: number } | null {
    const value = this.shown;
    const len = value.length;
    let x: number;
    let y: number;
    let h: number;
    if (len === 0 || (offset >= len && value[len - 1] === "\n")) {
      const r = this.probe.getBoundingClientRect();
      x = r.left;
      y = r.top;
      h = r.height;
    } else if (offset < len && value[offset] !== "\n") {
      const r = this.rects(offset, offset + 1)[0];
      if (!r) return null;
      x = r.left;
      y = r.top;
      h = r.height;
    } else if (offset > 0 && value[offset - 1] !== "\n") {
      const all = this.rects(offset - 1, offset);
      const r = all[all.length - 1];
      if (!r) return null;
      x = r.right;
      y = r.top;
      h = r.height;
    } else {
      const r = this.rects(offset, Math.min(len, offset + 1))[0];
      if (!r) return null;
      x = r.left;
      y = r.top;
      h = r.height;
    }
    if (!this.multiline) {
      // One line: the line itself never moves, so take its height from the
      // probe and ignore any letter that is still dropping in.
      const line = this.probe.getBoundingClientRect();
      y = line.top;
      h = line.height;
    }
    const base = this.layer.getBoundingClientRect();
    const s = this.scale || 1;
    const dpr = window.devicePixelRatio || 1;
    return {
      x: Math.round(((x - base.left) / s) * dpr) / dpr,
      y: (y - base.top) / s,
      h: h / s,
    };
  }

  private placeCaret(instant: boolean) {
    const field = this.field;
    const start = field.selectionStart;
    const end = field.selectionEnd;
    if (start === null || end === null) return;
    const hidden = start !== end;
    if (hidden !== this.lastCaret.hidden) {
      this.lastCaret.hidden = hidden;
      if (hidden) this.caret.setAttribute("data-hidden", "");
      else this.caret.removeAttribute("data-hidden");
    }
    if (hidden) return;
    const point = this.caretPoint(end);
    if (!point) return;
    const last = this.lastCaret;
    if (point.x === last.x && point.y === last.y && point.h === last.h) return;
    this.lastCaret = { ...point, hidden };
    if (instant) this.caret.setAttribute("data-instant", "");
    this.caret.style.transform = `translate(${point.x}px, ${point.y}px)`;
    this.caret.style.height = `${point.h}px`;
    if (instant) {
      void this.caret.offsetWidth;
      this.caret.removeAttribute("data-instant");
    }
    // Solid while it moves, blinking again once it rests.
    if (this.blink) this.blink.currentTime = 0;
  }

  // Falling letters ----------------------------------------------------------

  private dropLetters(from: number, to: number, backward: boolean) {
    const removed = this.shown.slice(from, to);
    const area = this.clip.getBoundingClientRect();
    const rootRect = this.root.getBoundingClientRect();
    const s = this.scale || 1;
    const letters: { text: string; rect: DOMRect }[] = [];
    const parts = graphemes(removed.length > MAX_SCAN ? removed.slice(0, MAX_SCAN) : removed);
    for (const part of parts) {
      if (letters.length >= MAX_GHOSTS) break;
      if (!part.text.trim()) continue;
      const rect = this.rects(from + part.index, from + part.index + part.text.length)[0];
      if (!rect || rect.width === 0) continue;
      if (
        rect.right < area.left ||
        rect.left > area.right ||
        rect.bottom < area.top ||
        rect.top > area.bottom
      ) {
        continue;
      }
      letters.push({ text: part.text, rect });
    }
    if (!letters.length) return;
    // Backspace takes letters from the right, so the rightmost goes first.
    if (backward) letters.reverse();
    const stagger = Math.min(18, 240 / letters.length);
    letters.forEach((letter, i) => {
      const ghost = el("tfx-ghost");
      ghost.textContent = letter.text;
      const h = letter.rect.height / s;
      ghost.style.left = `${(letter.rect.left - rootRect.left) / s}px`;
      ghost.style.top = `${(letter.rect.top - rootRect.top) / s}px`;
      ghost.style.height = `${h}px`;
      ghost.style.lineHeight = `${h}px`;
      this.root.append(ghost);
      this.ghosts++;
      const fall = h * (1.5 + Math.random() * 0.9);
      const drift = (Math.random() - 0.5) * h * 0.7;
      const spin = (Math.random() - 0.5) * 70;
      const anim = ghost.animate(
        [
          { transform: "translate(0, 0) rotate(0deg)", opacity: 1, easing: "cubic-bezier(0.2, 0, 0.4, 1)" },
          {
            transform: `translate(${drift * 0.15}px, ${-h * 0.14}px) rotate(${spin * 0.1}deg)`,
            opacity: 1,
            offset: 0.16,
            easing: "cubic-bezier(0.5, 0, 0.9, 0.45)",
          },
          { transform: `translate(${drift}px, ${fall}px) rotate(${spin}deg)`, opacity: 0 },
        ],
        { duration: GHOST_MS + Math.random() * 90, delay: i * stagger, fill: "backwards" },
      );
      const done = () => {
        ghost.remove();
        this.ghosts--;
        if (this.dead && this.ghosts === 0) this.root.remove();
      };
      anim.onfinish = done;
      anim.oncancel = done;
    });
  }
}
