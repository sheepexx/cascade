import { supabase } from "./supabase";

export type Comment = {
  id: string;
  project_id: string;
  difficulty_id: string | null;
  author: string;
  author_username: string | null;
  author_osu_id: number | null;
  time_ms: number;
  body: string;
  parent_id: string | null;
  resolved: boolean;
  created_at: string;
};

export async function listComments(projectId: string): Promise<Comment[]> {
  const { data, error } = await supabase
    .from("comments")
    .select("*")
    .eq("project_id", projectId)
    .order("time_ms", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Comment[];
}

export async function addComment(input: {
  projectId: string;
  authorId: string;
  authorUsername: string;
  authorOsuId: number;
  timeMs: number;
  body: string;
  difficultyId: string | null;
  parentId?: string | null;
}): Promise<void> {
  const { error } = await supabase.from("comments").insert({
    project_id: input.projectId,
    author: input.authorId,
    author_username: input.authorUsername,
    author_osu_id: input.authorOsuId,
    time_ms: Math.round(input.timeMs),
    body: input.body,
    difficulty_id: input.difficultyId,
    parent_id: input.parentId ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function resolveComment(
  id: string,
  resolved: boolean,
): Promise<void> {
  const { error } = await supabase
    .from("comments")
    .update({ resolved })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteComment(id: string): Promise<void> {
  const { error } = await supabase.from("comments").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export function subscribeComments(
  projectId: string,
  onChange: () => void,
): () => void {
  const channel = supabase
    .channel(`comments:${projectId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "comments",
        filter: `project_id=eq.${projectId}`,
      },
      () => onChange(),
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
