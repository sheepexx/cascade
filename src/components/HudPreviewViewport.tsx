import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { hudPreviewGeometry } from "../lib/hudLayout";

/** Keep the canvas and HUD in gameplay coordinates, scaling only their preview. */
export function HudPreviewViewport({
  editing,
  footer,
  children,
}: {
  editing: boolean;
  /** Fills the strip left under the scaled stage while editing. */
  footer?: ReactNode;
  children: (previewScale: number) => ReactNode;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!editing || !viewport) return;
    const measure = () => {
      const width = viewport.clientWidth;
      const height = viewport.clientHeight;
      setSize((prev) => prev.width === width && prev.height === height ? prev : { width, height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [editing]);

  const preview = editing && size.width > 0 && size.height > 0
    ? hudPreviewGeometry(size.width, size.height)
    : null;

  return (
    <div ref={viewportRef} className={`relative min-h-0 flex-1 ${editing ? "overflow-hidden" : ""}`}>
      <div
        data-hud-stage
        className="absolute left-0 top-0 h-full w-full origin-top-left"
        style={preview ? {
          width: preview.width,
          height: preview.height,
          left: preview.left,
          top: preview.top,
          transform: `scale(${preview.scale})`,
        } : undefined}
      >
        {children(preview?.scale ?? 1)}
      </div>
      {preview && footer && (
        <div
          className="absolute bottom-0 right-0"
          style={{ height: preview.top, left: preview.left }}
        >
          {footer}
        </div>
      )}
    </div>
  );
}
