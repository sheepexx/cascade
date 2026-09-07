import { usePwa } from "../hooks/usePwa";
import { InstallIcon } from "./ui/Icons";

export function InstallAppButton() {
  const { installable, install } = usePwa();
  if (!installable) return null;
  return (
    <button
      type="button"
      onClick={install}
      title="Install Cascade as a desktop app for offline use and more screen space"
      className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-ink-700/70 px-2.5 py-1.5 text-xs font-medium text-slate-200 shadow-sm backdrop-blur-sm transition duration-150 hover:border-white/20 hover:bg-ink-600/80 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 active:scale-[0.98]"
    >
      <InstallIcon className="h-3.5 w-3.5" />
      <span className="hidden uimd:inline">Install app</span>
    </button>
  );
}
