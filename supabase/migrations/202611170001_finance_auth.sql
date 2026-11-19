create table public.finance_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null,
  version bigint not null default 1,
  updated_at timestamptz not null default now()
);
alter table public.finance_states enable row level security;
revoke all on public.finance_states from anon;
grant select, insert, update on public.finance_states to authenticated;
create policy finance_select_own on public.finance_states for select to authenticated using ((select auth.uid()) = user_id);
create policy finance_insert_own on public.finance_states for insert to authenticated with check ((select auth.uid()) = user_id);
create policy finance_update_own on public.finance_states for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create or replace function public.save_finance_state(p_payload jsonb, p_expected_version bigint)
returns bigint language plpgsql security invoker set search_path = '' as $$
declare v_version bigint;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_expected_version is null or p_expected_version < 0 or p_payload is null or
     jsonb_typeof(p_payload -> 'expenses') is distinct from 'array' or
     jsonb_typeof(p_payload -> 'commands') is distinct from 'array' or
     jsonb_typeof(p_payload -> 'categories') is distinct from 'array' or
     jsonb_typeof(p_payload -> 'members') is distinct from 'array' then
    raise exception 'Invalid payload' using errcode = '22023';
  end if;
  if octet_length(p_payload::text) > 1500000 or jsonb_array_length(p_payload -> 'expenses') > 10000 or
     jsonb_array_length(p_payload -> 'categories') > 200 or jsonb_array_length(p_payload -> 'members') > 100 then
    raise exception 'Payload limit exceeded' using errcode = '22023';
  end if;
  insert into public.finance_states(user_id, payload, version) values(auth.uid(), p_payload, 1)
  on conflict (user_id) do update set payload = excluded.payload, version = finance_states.version + 1, updated_at = now()
  where finance_states.version = p_expected_version returning version into v_version;
  if v_version is null then raise exception 'Concurrent update' using errcode = '40001'; end if;
  return v_version;
end;
$$;
revoke all on function public.save_finance_state(jsonb, bigint) from public, anon;
grant execute on function public.save_finance_state(jsonb, bigint) to authenticated;

create table public.finance_ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  count integer not null default 0,
  primary key (user_id, day)
);
alter table public.finance_ai_usage enable row level security;
revoke all on public.finance_ai_usage from public, anon, authenticated;
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
create or replace function private.consume_finance_ai()
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  insert into public.finance_ai_usage(user_id, day, count) values(auth.uid(), (now() at time zone 'UTC')::date, 1)
  on conflict (user_id, day) do update set count = finance_ai_usage.count + 1
  where finance_ai_usage.count < 100 returning count into v_count;
  return v_count is not null;
end;
$$;
revoke all on function private.consume_finance_ai() from public, anon;
grant execute on function private.consume_finance_ai() to authenticated;
create or replace function public.consume_finance_ai()
returns boolean language sql security invoker set search_path = '' as $$ select private.consume_finance_ai(); $$;
revoke all on function public.consume_finance_ai() from public, anon;
grant execute on function public.consume_finance_ai() to authenticated;
