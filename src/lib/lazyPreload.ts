import {
  createElement,
  lazy,
  useState,
  type ComponentProps,
  type ComponentType,
} from "react";

// Same constraint React.lazy uses; `never` props reject class components.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyComponent = ComponentType<any>;

export type PreloadableComponent<T extends AnyComponent> = ComponentType<
  ComponentProps<T>
> & {
  preload: () => Promise<unknown>;
};

/**
 * `React.lazy` suspends on first render even when its chunk has already
 * arrived, which flashed the Suspense fallback on every first modal open.
 * Once `preload()` has resolved, new instances render the real component
 * directly and never suspend. An instance keeps whichever type it mounted
 * with, so a lazily mounted one is not remounted when the chunk lands.
 */
export function lazyWithPreload<T extends AnyComponent>(
  load: () => Promise<{ default: T }>,
): PreloadableComponent<T> {
  let loaded: T | null = null;
  let pending: Promise<{ default: T }> | null = null;
  const preload = () => {
    pending ??= load().then(
      (module) => {
        loaded = module.default;
        return module;
      },
      (error: unknown) => {
        // Let a later render or preload retry a chunk that failed to fetch.
        pending = null;
        throw error;
      },
    );
    return pending;
  };
  const Lazy = lazy(preload) as unknown as T;
  function Preloadable(props: ComponentProps<T>) {
    const [Component] = useState<AnyComponent>(() => loaded ?? Lazy);
    return createElement(Component, props);
  }
  return Object.assign(Preloadable, { preload });
}
