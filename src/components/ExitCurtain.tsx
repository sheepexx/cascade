export function ExitCurtain() {
  return (
    <div
      aria-hidden
      className="fixed inset-0 z-[300] cursor-wait overflow-hidden"
    >
      <div className="exit-shutter absolute inset-x-0 top-0 h-1/2 origin-top bg-[#05050a]" />
      <div className="exit-shutter absolute inset-x-0 bottom-0 h-1/2 origin-bottom bg-[#05050a]" />
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2">
        <div className="exit-beam h-[2px] w-full bg-[linear-gradient(90deg,transparent,rgba(232,104,104,0.75)_18%,#fff_50%,rgba(232,104,104,0.75)_82%,transparent)] shadow-[0_0_18px_4px_rgba(232,104,104,0.55)]" />
      </div>
    </div>
  );
}
