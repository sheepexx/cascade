import { useLayoutEffect, useRef } from "react";
import type { MenuMusic } from "../hooks/useMenuMusic";
import { EXIT_ANIMATION_MS, OUTRO } from "../lib/desktopExit";
import { menuMetrics } from "../lib/menuLayout";
import { Visualizer } from "./StartScreen";

// osu-framework's Easing.OutQuint.
const OUT_QUINT = "cubic-bezier(0.23, 1, 0.32, 1)";

/**
 * The quit outro, after osu!lazer's (see OUTRO). As in lazer, the logo loses
 * its colour and triangles and is only its rim and lettering, with the
 * visualiser still moving to the song around it. It starts from where the
 * menu's logo is, if that is on screen, and otherwise fades in where it rests.
 * With reduced motion the screen just goes dark.
 */
export function ExitOutro({
  from,
  reduced,
  music,
}: {
  /** The menu logo's box when quitting began, if it was showing. */
  from: DOMRect | null;
  reduced: boolean;
  /** The menu's song, still fading out, for the visualiser and the pulse. */
  music: MenuMusic;
}) {
  const backdropRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<HTMLDivElement | null>(null);
  const moveRef = useRef<HTMLDivElement | null>(null);
  const fadeRef = useRef<HTMLDivElement | null>(null);
  const spinRef = useRef<HTMLDivElement | null>(null);
  const pulseRef = useRef<HTMLDivElement | null>(null);
  const size = menuMetrics(window.innerWidth, window.innerHeight).logoClosed;

  useLayoutEffect(() => {
    const backdrop = backdropRef.current;
    const game = gameRef.current;
    const move = moveRef.current;
    const fade = fadeRef.current;
    const spin = spinRef.current;
    if (!backdrop || !game || !move || !fade || !spin) return;
    const animations: Animation[] = [];
    const run = (el: HTMLElement, frames: Keyframe[], options: KeyframeAnimationOptions) =>
      animations.push(el.animate(frames, { fill: "both", ...options }));

    run(backdrop, [{ opacity: 0 }, { opacity: 1 }], {
      duration: reduced ? 120 : OUTRO.backdropMs,
    });
    if (reduced) {
      game.style.opacity = "0";
      return () => animations.forEach((a) => a.cancel());
    }

    // Game.FadeTo(0.01f, fadeOutTime): everything, the logo included.
    run(game, [{ opacity: 1 }, { opacity: 0.01 }], { duration: EXIT_ANIMATION_MS });

    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const visible = from && from.width > 0 && from.height > 0;
    const start = visible
      ? `translate(${from.left + from.width / 2 - cx}px, ${
          from.top + from.height / 2 - cy
        }px) scale(${from.width / size})`
      : "translate(0px, 0px) scale(1)";
    run(
      move,
      [
        { transform: start, opacity: visible ? 1 : 0 },
        { transform: "translate(0px, 0px) scale(1)", opacity: 1 },
      ],
      { duration: OUTRO.settleMs, easing: OUT_QUINT },
    );
    run(fade, [{ opacity: 1 }, { opacity: 0 }], {
      duration: OUTRO.logoFadeMs,
      delay: OUTRO.settleMs,
    });
    run(spin, [{ transform: "rotate(0deg)" }, { transform: `rotate(${OUTRO.spinDegrees}deg)` }], {
      duration: OUTRO.spinMs,
      delay: OUTRO.settleMs,
    });
    return () => animations.forEach((a) => a.cancel());
  }, [from, reduced, size]);

  return (
    <div aria-hidden className="fixed inset-0 z-[300] cursor-wait overflow-hidden">
      <div ref={backdropRef} className="absolute inset-0 bg-black" style={{ opacity: 0 }} />
      <div ref={gameRef} className="absolute inset-0">
        <div
          className="absolute left-1/2 top-1/2"
          style={{ width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2 }}
        >
          <div ref={moveRef} className="h-full w-full" style={{ opacity: 0 }}>
            <div ref={fadeRef} className="h-full w-full">
              <div ref={spinRef} className="h-full w-full">
                {!reduced && (
                  <div ref={pulseRef} className="relative h-full w-full">
                    <Visualizer
                      music={music}
                      size={size}
                      pulseRef={pulseRef}
                      active={music.isPlaying}
                    />
                    <img
                      src={`${import.meta.env.BASE_URL}logo-rim.png?v=1`}
                      alt=""
                      draggable={false}
                      className="relative h-full w-full select-none"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
