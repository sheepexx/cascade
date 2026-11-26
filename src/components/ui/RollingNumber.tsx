import { useLayoutEffect, useRef, useState } from "react";
import { reduceMotion } from "../../lib/performanceMode";

/**
 * A number whose digits roll to their new value like the wheels of an
 * electricity meter. Each digit is a strip of 0–9 behind a one-digit window;
 * when the value goes up the wheels roll forward (9 carries round to 0), when
 * it goes down they roll back. Anything that is not a digit (".", "%", "/",
 * "★") stays put, and digits are matched from the right, so 99 → 100 rolls
 * the existing wheels and adds a new one in front.
 *
 * The text is formatted by the caller and also rendered for screen readers,
 * so the rolling copy can stay aria-hidden.
 */
export function RollingNumber({
  value,
  format,
  className = "",
}: {
  value: number;
  /** Turns the value into the text shown. Defaults to String(value). */
  format?: (value: number) => string;
  className?: string;
}) {
  const text = format ? format(value) : String(value);
  // Which way the wheels turn is decided once per new value. A ref keeps it
  // stable through StrictMode's second render.
  const last = useRef({ value, direction: 1 as 1 | -1 });
  if (value !== last.current.value) {
    last.current = {
      value,
      direction: value > last.current.value ? 1 : -1,
    };
  }
  const direction = last.current.direction;
  const mounted = useRef(false);
  useLayoutEffect(() => {
    mounted.current = true;
  }, []);

  const chars = Array.from(text);
  return (
    <span className={`rolling-number ${className}`}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {chars.map((char, index) => {
          const fromRight = chars.length - 1 - index;
          const digit = char.charCodeAt(0) - 48;
          if (char.length === 1 && digit >= 0 && digit <= 9) {
            return (
              <RollDigit
                key={`d${fromRight}`}
                digit={digit}
                direction={direction}
                enter={mounted.current}
              />
            );
          }
          return (
            <span
              key={`s${fromRight}${char}`}
              className="rolling-number-static"
              data-char={char}
            />
          );
        })}
      </span>
    </span>
  );
}

/**
 * A translated sentence with a rolling number in it ("12 selected",
 * "Выделено: 12"). The translation is rendered as given; the first place the
 * number appears in it rolls. If the number cannot be found (a locale wrote
 * it with grouping, say), the sentence is shown as plain text.
 */
export function RollingInText({
  text,
  value,
  className = "",
}: {
  text: string;
  value: number;
  className?: string;
}) {
  const digits = String(value);
  const at = text.indexOf(digits);
  if (at < 0) return <span className={className}>{text}</span>;
  return (
    <span className={className}>
      {text.slice(0, at)}
      <RollingNumber value={value} />
      {text.slice(at + digits.length)}
    </span>
  );
}

/** Ten digits, five times over (drawn by .rolling-number-strip::before in
 *  index.css), so a wheel can keep rolling the same way for a while before
 *  it is quietly moved back to the middle copy. */
const CYCLES = 5;
const CELLS = CYCLES * 10;
const REST = 20;

const stripTransform = (position: number) =>
  `translateY(${(-100 * position) / CELLS}%)`;

function RollDigit({
  digit,
  direction,
  enter,
}: {
  digit: number;
  direction: 1 | -1;
  /** A wheel added after the first render rolls up from 0. */
  enter: boolean;
}) {
  const stripRef = useRef<HTMLSpanElement>(null);
  const shown = useRef(enter ? 0 : digit);
  const position = useRef(REST + shown.current);
  // Written once; later moves go straight to the element so React never
  // fights the transition.
  const [initial] = useState(() => stripTransform(position.current));

  useLayoutEffect(() => {
    const strip = stripRef.current;
    if (!strip || digit === shown.current) return;
    const previous = shown.current;
    shown.current = digit;
    const steps =
      direction > 0 ? (digit - previous + 10) % 10 : -((previous - digit + 10) % 10);
    let next = position.current + steps;
    if (reduceMotion() || next < 0 || next >= CELLS) {
      next = REST + digit;
      snap(strip, next);
    } else {
      strip.style.transform = stripTransform(next);
    }
    position.current = next;
  }, [digit, direction]);

  return (
    <span className="rolling-number-digit" data-digit={digit}>
      <span
        ref={stripRef}
        className="rolling-number-strip"
        style={{ transform: initial }}
        onTransitionEnd={(event) => {
          // Once a wheel stops, move it back to the middle copy of the same
          // digit, unseen, so it always has room to roll either way.
          const strip = event.currentTarget;
          const rest = REST + shown.current;
          if (position.current === rest) return;
          position.current = rest;
          snap(strip, rest);
        }}
      />
    </span>
  );
}

function snap(strip: HTMLElement, position: number) {
  strip.style.transition = "none";
  strip.style.transform = stripTransform(position);
  void strip.offsetHeight;
  strip.style.transition = "";
}
