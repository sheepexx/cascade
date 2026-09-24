import { useEffect, useState } from "react";
import { loadImage } from "../lib/shareCard";

export type LoadedImageState = {
  image: HTMLImageElement | null;
  status: "none" | "loading" | "ready" | "error";
};

export function useLoadedImage(url: string | null): LoadedImageState {
  const [state, setState] = useState<LoadedImageState>({
    image: null,
    status: url ? "loading" : "none",
  });

  useEffect(() => {
    if (!url) {
      setState({ image: null, status: "none" });
      return;
    }
    let cancelled = false;
    setState({ image: null, status: "loading" });
    void loadImage(url).then((image) => {
      if (cancelled) return;
      setState(image ? { image, status: "ready" } : { image: null, status: "error" });
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return state;
}
