-- Reactions on private messages.
--
-- Each message keeps its reactions in a jsonb column, emoji to the ids of
-- the members who reacted with it. Living on the message row, they reach an
-- open conversation over the same Postgres Changes subscription as the
-- messages themselves, filtered by messages_select_member, so only the two
-- members ever see them. Writes go through toggle_reaction.
--
-- Deleting a message clears its reactions along with its text.
--
-- Safe to run more than once.

alter table public.messages
  add column if not exists reactions jsonb not null default '{}'::jsonb;

-- Adds the caller's reaction, or takes it away when it is already there.
-- Returns the message.
create or replace function public.toggle_reaction(p_message uuid, p_emoji text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_emoji text := trim(coalesce(p_emoji, ''));
  v_message public.messages;
  v_other uuid;
  v_users jsonb;
begin
  if v_me is null then
    raise exception 'sign in first';
  end if;
  -- One emoji, which can be several code points (skin tones, flags, ZWJ
  -- sequences), but never text: no ASCII beyond the digits, # and * that
  -- keycaps are made of, and never ASCII alone.
  if char_length(v_emoji) = 0 or char_length(v_emoji) > 16 or octet_length(v_emoji) > 64
     or v_emoji ~ '[\x01-\x22\x24-\x29\x2b-\x2f\x3a-\x7f]'
     or v_emoji ~ '^[\x01-\x7f]*$'
     or v_emoji ~ '\s' then
    raise exception 'That isn''t a reaction.';
  end if;

  select * into v_message from public.messages where id = p_message for update;
  if v_message.id is null or v_message.deleted_at is not null then
    raise exception 'message not found';
  end if;
  v_other := public.conversation_partner(v_message.conversation_id, v_me);
  if v_other is null then
    raise exception 'message not found';
  end if;
  if not public.can_message_user(v_me, v_other) then
    raise exception 'You can''t react in this conversation.';
  end if;

  v_users := coalesce(v_message.reactions -> v_emoji, '[]'::jsonb);
  if v_users ? v_me::text then
    v_users := (
      select coalesce(jsonb_agg(u), '[]'::jsonb)
      from jsonb_array_elements_text(v_users) u
      where u <> v_me::text
    );
  else
    if not (v_message.reactions ? v_emoji)
       and (select count(*) from jsonb_object_keys(v_message.reactions)) >= 20 then
      raise exception 'This message has as many reactions as it can hold.';
    end if;
    v_users := v_users || to_jsonb(v_me::text);
  end if;

  update public.messages
    set reactions = case
      when jsonb_array_length(v_users) = 0 then reactions - v_emoji
      else jsonb_set(reactions, array[v_emoji], v_users)
    end
    where id = p_message
    returning * into v_message;

  return row_to_json(v_message);
end;
$$;

revoke execute on function public.toggle_reaction(uuid, text) from public, anon;
grant execute on function public.toggle_reaction(uuid, text) to authenticated;

create or replace function public.delete_message(p_message uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'sign in first';
  end if;
  update public.messages
    set body = '', deleted_at = now(), edited_at = null, reactions = '{}'::jsonb
    where id = p_message and sender = v_me and deleted_at is null;
  if not found then
    raise exception 'You can only delete your own messages.';
  end if;
end;
$$;

grant execute on function public.delete_message(uuid) to authenticated;

notify pgrst, 'reload schema';
