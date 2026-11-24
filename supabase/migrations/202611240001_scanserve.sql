begin;

create table public.scanserve_restaurants (
  slug text primary key check (slug ~ '^[a-z0-9-]{1,64}$'),
  version bigint not null default 0,
  state jsonb not null check (jsonb_typeof(state) = 'object' and state ? 'slug' and state->>'slug' = slug),
  updated_at timestamptz not null default now()
);
alter table public.scanserve_restaurants enable row level security;
revoke all on public.scanserve_restaurants from anon, authenticated;
grant select, insert, update on public.scanserve_restaurants to service_role;

create function public.scanserve_read(p_slug text)
returns jsonb language sql stable security invoker set search_path = ''
as $$
  select jsonb_build_object('version', version, 'state', state)
  from public.scanserve_restaurants where slug = p_slug;
$$;

create function public.scanserve_write(p_slug text, p_version bigint, p_state jsonb)
returns boolean language plpgsql security invoker set search_path = ''
as $$
begin
  if p_version = -1 then
    insert into public.scanserve_restaurants(slug, state) values (p_slug, p_state)
    on conflict do nothing;
  else
    update public.scanserve_restaurants
    set state = p_state, version = version + 1, updated_at = now()
    where slug = p_slug and version = p_version;
  end if;
  return found;
end;
$$;

revoke all on function public.scanserve_read(text) from public, anon, authenticated;
revoke all on function public.scanserve_write(text,bigint,jsonb) from public, anon, authenticated;
grant execute on function public.scanserve_read(text) to service_role;
grant execute on function public.scanserve_write(text,bigint,jsonb) to service_role;
commit;
