import { supabase } from "./supabase";

export type FeedbackStatus = "open" | "reviewed" | "closed";

export type Feedback = {
  id: string;
  user_id: string;
  author_username: string | null;
  author_osu_id: number | null;
  body: string;
  status: FeedbackStatus;
  created_at: string;
};

const COLUMNS =
  "id,user_id,author_username,author_osu_id,body,status,created_at";

export async function submitFeedback(input: {
  userId: string;
  username: string;
  osuId: number;
  body: string;
}): Promise<void> {
  const { error } = await supabase.from("feedback").insert({
    user_id: input.userId,
    author_username: input.username,
    author_osu_id: input.osuId,
    body: input.body,
  });
  if (error) throw new Error(error.message);
}

export async function listFeedback(): Promise<Feedback[]> {
  const { data, error } = await supabase
    .from("feedback")
    .select(COLUMNS)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Feedback[];
}

export async function setFeedbackStatus(
  id: string,
  status: FeedbackStatus,
): Promise<void> {
  const { error } = await supabase
    .from("feedback")
    .update({ status })
    .eq("id", id);
  if (error) throw new Error(error.message);
}
