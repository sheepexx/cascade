/**
 * Where a key moves a dropdown's selection: the next or previous option that
 * can be chosen, skipping disabled ones the way a native <select> does. Null
 * when the key doesn't move it, including in a list where nothing can be
 * chosen. `index` is the current option, or -1 when none is selected.
 */
export function dropdownKeyTarget(
  options: readonly { disabled?: boolean }[],
  index: number,
  key: string,
): number | null {
  const scan = (from: number, step: 1 | -1) => {
    for (let i = from; i >= 0 && i < options.length; i += step) {
      if (!options[i].disabled) return i;
    }
    return null;
  };
  switch (key) {
    case "ArrowDown":
      return scan(index + 1, 1);
    case "ArrowUp":
      return scan(index < 0 ? options.length - 1 : index - 1, -1);
    case "Home":
      return scan(0, 1);
    case "End":
      return scan(options.length - 1, -1);
    default:
      return null;
  }
}
