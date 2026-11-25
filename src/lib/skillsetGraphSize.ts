/** The skillset graph's header row, which stays when it is minimised. */
export const SKILLSET_HEADER_HEIGHT = 18;
/** Its bars, under the header. */
export const SKILLSET_BARS_HEIGHT = 30;

/** Across a horizontal strip: header and bars, or just the header. */
export const SKILLSET_HORIZONTAL_HEIGHT = {
  open: SKILLSET_HEADER_HEIGHT + SKILLSET_BARS_HEIGHT,
  collapsed: SKILLSET_HEADER_HEIGHT,
};

/** Across a vertical strip: the bars, or just the fold button when minimised. */
export const SKILLSET_VERTICAL_WIDTH = { open: 56, collapsed: 22 };
