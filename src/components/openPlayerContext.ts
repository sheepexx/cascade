import { createContext } from "react";

/**
 * Opens a Cascade profile for a player floating on the main menu. Without a
 * provider (the social features off) the avatars link to osu! as before.
 */
export const OpenPlayerContext = createContext<((username: string) => void) | null>(null);
