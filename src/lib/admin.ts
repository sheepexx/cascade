import { supabase } from "./supabase";

/**
 * Admin-only data access. Every call is authorized by the `is_admin()` RLS
 * policies in the database (the signed-in admin's minted token), so no separate
 * privileged endpoint is required.
 */

export type AdminUser = {
  id: string;
  osu_id: number;
  username: string;
  avatar_url: string | null;
  is_admin: boolean;
  created_at: string;
};

export type AdminProject = {
  id: string;
  owner: string;
  title: string;
  artist: string;
  creator: string;
  updated_at: string;
};

export async function listAllUsers(): Promise<AdminUser[]> {
  const { data, error } = await supabase
    .from("users")
    .select("id,osu_id,username,avatar_url,is_admin,created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as AdminUser[];
}

export async function setUserAdmin(
  id: string,
  isAdmin: boolean,
): Promise<void> {
  const { error } = await supabase
    .from("users")
    .update({ is_admin: isAdmin })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function listAllProjects(): Promise<AdminProject[]> {
  const { data, error } = await supabase
    .from("projects")
    .select("id,owner,title,artist,creator,updated_at")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as AdminProject[];
}

export async function deleteProjectAdmin(id: string): Promise<void> {
  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
