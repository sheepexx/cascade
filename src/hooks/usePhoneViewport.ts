import { useEffect, useState } from "react";

const PHONE_MAX_WIDTH = 720;

function isPhoneViewport(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(pointer: coarse)").matches === true &&
    window.innerWidth < PHONE_MAX_WIDTH
  );
}

/**
 * True on a narrow touch screen. The start screen swaps to its phone layout on
 * this, and the app header stays visible on it so sign-in, the account menu and
 * the admin panel remain reachable without the radial menu phones never open.
 */
export function usePhoneViewport(): boolean {
  const [phone, setPhone] = useState(isPhoneViewport);
  useEffect(() => {
    const update = () => setPhone(isPhoneViewport());
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);
  return phone;
}
