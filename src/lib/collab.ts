import { supabase } from "./supabase";

export type CollabRole = "editor" | "viewer";

export type Collaborator = {
  user_id: string;
  role: CollabRole;
  username: string | null;
  avatar_url: string | null;
  osu_id: number | null;
};

export async function listCollaborators(
  projectId: string,
): Promise<Collaborator[]> {
  const { data, error } = await supabase
    .from("project_collaborators")
    .select("user_id,role,users:user_id(username,avatar_url,osu_id)")
    .eq("project_id", projectId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    const u = Array.isArray(r.users) ? r.users[0] : r.users;
    const user = (u ?? {}) as {
      username?: string;
      avatar_url?: string;
      osu_id?: number;
    };
    return {
      user_id: r.user_id as string,
      role: r.role as CollabRole,
      username: user.username ?? null,
      avatar_url: user.avatar_url ?? null,
      osu_id: user.osu_id ?? null,
    };
  });
}

export async function addCollaborator(
  projectId: string,
  username: string,
  role: CollabRole,
): Promise<void> {
  const { error } = await supabase.rpc("add_collaborator", {
    p_project: projectId,
    p_username: username,
    p_role: role,
  });
  if (error) throw new Error(error.message);
}

export async function setCollaboratorRole(
  projectId: string,
  userId: string,
  role: CollabRole,
): Promise<void> {
  const { error } = await supabase
    .from("project_collaborators")
    .update({ role })
    .eq("project_id", projectId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function removeCollaborator(
  projectId: string,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from("project_collaborators")
    .delete()
    .eq("project_id", projectId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export type AccessRole = "owner" | CollabRole | null;

export async function myAccess(
  projectId: string,
  myUserId: string,
): Promise<AccessRole> {
  const { data: proj } = await supabase
    .from("projects")
    .select("owner")
    .eq("id", projectId)
    .maybeSingle();
  if (proj?.owner === myUserId) return "owner";
  const { data: collab } = await supabase
    .from("project_collaborators")
    .select("role")
    .eq("project_id", projectId)
    .eq("user_id", myUserId)
    .maybeSingle();
  return (collab?.role as CollabRole | undefined) ?? null;
}
