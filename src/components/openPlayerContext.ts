import { createContext } from "react";

/**
 * What the main menu's online list can open for a player. Without a provider
 * (the social features off) its rows link to osu! profiles instead.
 */
export type PlayerActions = {
  openProfile: (name: string) => void;
  /** A conversation with them, or their profile when one can't be opened. */
  openMessages: (userId: string, name: string) => void;
};

export const OpenPlayerContext = createContext<PlayerActions | null>(null);
