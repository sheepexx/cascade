import { useCallback, useState } from "react";
import { useT } from "../../lib/i18n";
import {
  blockUser,
  cancelFriendRequest,
  removeFriend,
  respondFriendRequest,
  sendFriendRequest,
  unblockUser,
  type Relationship,
} from "../../lib/social";
import { errorText, useNotice } from "./socialUtils";

export type RelationshipAction =
  | "add"
  | "accept"
  | "decline"
  | "cancel"
  | "remove"
  | "block"
  | "unblock";

/**
 * Friend and block actions for one person. The new relationship shows at
 * once; if the server refuses, it goes back and the reason is shown.
 */
export function useRelationship(
  userId: string,
  relationship: Relationship,
  onChange: (relationship: Relationship) => void,
) {
  const t = useT();
  const notice = useNotice();
  const [busy, setBusy] = useState<RelationshipAction | null>(null);

  const run = useCallback(
    async (action: RelationshipAction) => {
      if (busy) return;
      const before = relationship;
      setBusy(action);
      try {
        switch (action) {
          case "add": {
            onChange("outgoing");
            const next = await sendFriendRequest(userId);
            onChange(next);
            notice({
              tone: "success",
              text: next === "friends" ? t("social.nowFriends") : t("social.requestSent"),
            });
            break;
          }
          case "accept":
            onChange("friends");
            onChange(await respondFriendRequest(userId, true));
            notice({ tone: "success", text: t("social.nowFriends") });
            break;
          case "decline":
            onChange("none");
            await respondFriendRequest(userId, false);
            break;
          case "cancel":
            onChange("none");
            await cancelFriendRequest(userId);
            break;
          case "remove":
            onChange("none");
            await removeFriend(userId);
            notice({ tone: "info", text: t("social.friendRemoved") });
            break;
          case "block":
            onChange("blocked");
            await blockUser(userId);
            notice({ tone: "info", text: t("social.blocked") });
            break;
          case "unblock":
            onChange("none");
            await unblockUser(userId);
            notice({ tone: "info", text: t("social.unblocked") });
            break;
        }
      } catch (error) {
        onChange(before);
        notice({ tone: "error", text: errorText(error, t("social.actionFailed")) });
      } finally {
        setBusy(null);
      }
    },
    [busy, notice, onChange, relationship, t, userId],
  );

  return { busy, run };
}
