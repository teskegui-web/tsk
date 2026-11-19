create table private.finance_family_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  owner_id uuid not null references private.finance_family_accounts(user_id) on delete cascade
);
create index finance_family_accounts_owner_idx on private.finance_family_accounts(owner_id);

create table private.finance_family_invites (
  owner_id uuid not null references private.finance_family_accounts(user_id) on delete cascade,
  email text not null,
  primary key (owner_id, email)
);
create index finance_family_invites_email_idx on private.finance_family_invites(email);

alter table private.finance_family_accounts enable row level security;
alter table private.finance_family_invites enable row level security;
revoke all on private.finance_family_accounts, private.finance_family_invites from public, anon, authenticated;

create function private.finance_family(p_action text, p_target text, p_month text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  caller_email text;
  family_owner uuid;
begin
  if caller is null then
    raise exception 'Autenticação necessária.' using errcode = '28000';
  end if;
  select lower(u.email) into caller_email from auth.users u
  where u.id = caller and u.email_confirmed_at is not null;
  if caller_email is null then
    raise exception 'Confirme seu e-mail para usar a família.' using errcode = '22023';
  end if;

  if p_action <> 'read' then
    perform pg_catalog.pg_advisory_xact_lock(84216, 1);
  end if;
  select a.owner_id into family_owner from private.finance_family_accounts a where a.user_id = caller;

  case p_action
    when 'create' then
      if family_owner is not null then raise exception 'Você já está em uma família.' using errcode = '22023'; end if;
      insert into private.finance_family_accounts values (caller, caller);
    when 'invite' then
      if family_owner is distinct from caller then raise exception 'Somente o responsável pode convidar.' using errcode = '42501'; end if;
      p_target := lower(trim(p_target));
      if p_target is null or length(p_target) > 254 or p_target !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or p_target = caller_email then
        raise exception 'Informe outro e-mail válido.' using errcode = '22023';
      end if;
      if exists (select 1 from private.finance_family_accounts a join auth.users u on u.id = a.user_id
        where a.owner_id = caller and lower(u.email) = p_target) then
        raise exception 'Essa conta já está na sua família.' using errcode = '22023';
      end if;
      if (select count(*) from private.finance_family_invites i where i.owner_id = caller) >= 20 then
        raise exception 'Limite de convites pendentes atingido.' using errcode = '22023';
      end if;
      insert into private.finance_family_invites values (caller, p_target) on conflict do nothing;
    when 'accept' then
      if family_owner is not null then raise exception 'Saia da família atual antes de aceitar outro convite.' using errcode = '22023'; end if;
      if not exists (select 1 from private.finance_family_invites i where i.owner_id::text = p_target and i.email = caller_email) then
        raise exception 'Este convite não está disponível.' using errcode = '22023';
      end if;
      if (select count(*) from private.finance_family_accounts a where a.owner_id::text = p_target) >= 12 then
        raise exception 'Esta família atingiu o limite de contas.' using errcode = '22023';
      end if;
      insert into private.finance_family_accounts values (caller, p_target::uuid);
      delete from private.finance_family_invites i where i.owner_id::text = p_target and i.email = caller_email;
    when 'decline' then
      delete from private.finance_family_invites i where i.owner_id::text = p_target and i.email = caller_email;
    when 'cancel' then
      if family_owner is distinct from caller then raise exception 'Somente o responsável pode cancelar.' using errcode = '42501'; end if;
      delete from private.finance_family_invites i where i.owner_id = caller and i.email = p_target;
    when 'remove' then
      if family_owner is distinct from caller then raise exception 'Somente o responsável pode remover contas.' using errcode = '42501'; end if;
      delete from private.finance_family_accounts a where a.owner_id = caller and a.user_id::text = p_target and a.user_id <> caller;
    when 'leave' then
      delete from private.finance_family_accounts a where a.user_id = caller;
    when 'read' then
      if p_month is null or p_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
        raise exception 'Mês inválido.' using errcode = '22023';
      end if;
      return jsonb_build_object(
        'owner', family_owner = caller,
        'joined', family_owner is not null,
        'invitations', coalesce((
          select jsonb_agg(jsonb_build_object('id', i.owner_id, 'name', u.email) order by u.email)
          from private.finance_family_invites i join auth.users u on u.id = i.owner_id
          where i.email = caller_email
        ), '[]'::jsonb),
        'pending', coalesce((
          select jsonb_agg(i.email order by i.email) from private.finance_family_invites i
          where family_owner = caller and i.owner_id = caller
        ), '[]'::jsonb),
        'members', coalesce((
          select jsonb_agg(jsonb_build_object('id', a.user_id, 'name', u.email, 'self', a.user_id = caller,
            'entries', coalesce((
              select jsonb_agg(jsonb_build_object('description', e.item->>'description', 'cents', e.item->'cents',
                'kind', e.item->>'kind', 'status', e.item->>'status',
                'date', left(case when e.item->>'status' = 'scheduled' then e.item->>'dueDate' else coalesce(e.item->>'paidAt', e.item->>'createdAt') end, 10)))
              from jsonb_array_elements(case when jsonb_typeof(s.payload->'expenses') = 'array'
                then s.payload->'expenses' else '[]'::jsonb end) e(item)
              where left(case when e.item->>'status' = 'scheduled' then e.item->>'dueDate'
                else coalesce(e.item->>'paidAt', e.item->>'createdAt') end, 7) = p_month
                and jsonb_typeof(e.item->'cents') = 'number'
            ), '[]'::jsonb)) order by a.user_id <> caller, u.email)
          from private.finance_family_accounts a join auth.users u on u.id = a.user_id
          left join public.finance_states s on s.user_id = a.user_id
          where a.owner_id = family_owner
        ), '[]'::jsonb)
      );
    else raise exception 'Ação inválida.' using errcode = '22023';
  end case;
  return '{}'::jsonb;
end;
$$;
revoke all on function private.finance_family(text, text, text) from public, anon;
grant execute on function private.finance_family(text, text, text) to authenticated;

create function public.finance_family(p_action text, p_target text default null, p_month text default null)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.finance_family(p_action, p_target, p_month);
$$;
revoke all on function public.finance_family(text, text, text) from public, anon;
grant execute on function public.finance_family(text, text, text) to authenticated;

