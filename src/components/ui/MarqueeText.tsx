import { useRef, useState } from "react";

const SPEED_PX_PER_S = 28;

export function MarqueeText({
  text,
  className = "",
  onDoubleClick,
  title,
}: {
  text: string;
  className?: string;
  onDoubleClick?: (e: React.MouseEvent) => void;
  title?: string;
}) {
  const outerRef = useRef<HTMLSpanElement>(null);
  const innerRef = useRef<HTMLSpanElement>(null);
  const [scroll, setScroll] = useState(0);

  const start = () => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;
    const overflow = inner.scrollWidth - outer.clientWidth;
    if (overflow > 4) setScroll(overflow);
  };

  return (
    <span
      ref={outerRef}
      onMouseEnter={start}
      onMouseLeave={() => setScroll(0)}
      onDoubleClick={onDoubleClick}
      title={title}
      className={`block overflow-hidden whitespace-nowrap ${className}`}
    >
      <span
        ref={innerRef}
        className={scroll ? "inline-block" : "block truncate"}
        style={{
          transform: `translateX(-${scroll}px)`,
          transition: scroll
            ? `transform ${scroll / SPEED_PX_PER_S}s linear`
            : "transform 0.25s ease-out",
        }}
      >
        {text}
      </span>
    </span>
  );
}
