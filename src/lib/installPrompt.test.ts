import { describe, expect, it } from "vitest";
import {
  INSTALL_DISMISS_WAIT_MS,
  INSTALL_SNOOZE_MS,
  loadInstallRecord,
  mayOfferInstall,
  recordInstallDismissed,
  recordInstallIgnored,
  recordInstalled,
} from "./installPrompt";

function store() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

describe("install offers", () => {
  it("offers to someone who hasn't answered", () => {
    expect(mayOfferInstall(loadInstallRecord(store()), 0)).toBe(true);
  });

  it("waits a month after a no, and stops after the second", () => {
    const s = store();
    let record = recordInstallDismissed(1000, s);
    expect(mayOfferInstall(record, 1000 + INSTALL_DISMISS_WAIT_MS - 1)).toBe(false);
    expect(mayOfferInstall(record, 1000 + INSTALL_DISMISS_WAIT_MS)).toBe(true);
    record = recordInstallDismissed(1000 + INSTALL_DISMISS_WAIT_MS, s);
    expect(record.dismissals).toBe(2);
    expect(mayOfferInstall(record, 1000 + 10 * INSTALL_DISMISS_WAIT_MS)).toBe(false);
  });

  it("brings an ignored offer back after a few days", () => {
    const s = store();
    const record = recordInstallIgnored(1000, s);
    expect(mayOfferInstall(record, 1000 + INSTALL_SNOOZE_MS - 1)).toBe(false);
    expect(mayOfferInstall(record, 1000 + INSTALL_SNOOZE_MS)).toBe(true);
    expect(record.dismissals).toBe(0);
  });

  it("never offers once installed", () => {
    const s = store();
    expect(mayOfferInstall(recordInstalled(s), 0)).toBe(false);
    expect(loadInstallRecord(s).installed).toBe(true);
  });

  it("reads junk as no answer", () => {
    const s = store();
    s.setItem("cascade:install-offer", "{");
    expect(loadInstallRecord(s)).toEqual({ dismissals: 0, lastDismissedAt: null, snoozedUntil: null, installed: false });
    s.setItem("cascade:install-offer", JSON.stringify({ dismissals: "2", installed: "yes" }));
    expect(loadInstallRecord(s).dismissals).toBe(0);
    expect(loadInstallRecord(s).installed).toBe(false);
  });
});
