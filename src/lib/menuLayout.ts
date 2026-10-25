/**
 * How big the start menu's bar and logo are for a window, shared by the menu
 * and the intro that hands over to its logo.
 *
 * The menu is sized after osu!lazer's, which grows with the window: at 1440p
 * its button band is 181px tall and the logo 890px across closed, 422px open.
 * Like lazer it scales to fit a 4:3 frame, so a narrow window goes by its
 * width instead.
 */
const LAZER_HEIGHT = 1440;
const BAR_LAZER = 181;
const LOGO_CLOSED_RATIO = 890 / 181;
const LOGO_OPEN_RATIO = 422 / 181;
const BAR_MIN = 96;
const LOGO_MIN = 168;

export type MenuMetrics = {
  /** Room for the bar across the middle rather than the stacked panel. */
  wide: boolean;
  bar: number;
  logoClosed: number;
  logoOpen: number;
};

export function menuMetrics(vw: number, vh: number): MenuMetrics {
  const wide = vw >= 900 && vh >= 560;
  const bar = Math.max(
    BAR_MIN,
    Math.round((BAR_LAZER * Math.min(vh, vw * 0.75)) / LAZER_HEIGHT),
  );
  // Whatever fits the window: lazer's size where there's room, and only a
  // small wide window, where the bar bottoms out, trims it to fit.
  const fit = Math.round(wide ? Math.min(vw * 0.46, vh * 0.64) : Math.min(vw * 0.68, vh * 0.44));
  const logoClosed = Math.max(
    LOGO_MIN,
    wide ? Math.min(fit, Math.round(bar * LOGO_CLOSED_RATIO)) : fit,
  );
  const logoOpen = wide ? Math.round(bar * LOGO_OPEN_RATIO) : logoClosed;
  return { wide, bar, logoClosed, logoOpen };
}
