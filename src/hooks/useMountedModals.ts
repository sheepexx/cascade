import { useEffect, useState } from "react";

const UNMOUNT_DELAY_MS = 320;

export function useMountedModals<T extends string>(
  active: T | null,
): (id: T) => boolean {
  const [mounted, setMounted] = useState<readonly T[]>([]);

  useEffect(() => {
    if (!active) return;
    setMounted((prev) => (prev.includes(active) ? prev : [...prev, active]));
  }, [active]);

  useEffect(() => {
    if (!mounted.some((id) => id !== active)) return;
    const timer = window.setTimeout(() => {
      setMounted((prev) => {
        const next = prev.filter((id) => id === active);
        return next.length === prev.length ? prev : next;
      });
    }, UNMOUNT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [active, mounted]);

  return (id: T) => id === active || mounted.includes(id);
}
