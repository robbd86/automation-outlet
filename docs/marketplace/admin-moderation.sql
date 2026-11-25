begin;
create table marketplace_private.admin_members(user_id uuid primary key references auth.users(id) on delete cascade,created_at timestamptz not null default now());
alter table marketplace_private.admin_members enable row level security;
revoke all on marketplace_private.admin_members from public,anon,authenticated;
create function marketplace_private.is_admin() returns boolean language sql stable security definer set search_path='' as $$
select marketplace_private.verified_user() and exists(select 1 from marketplace_private.admin_members where user_id=(select auth.uid()))
$$;
revoke all on function marketplace_private.is_admin() from public,anon,authenticated;
grant execute on function marketplace_private.is_admin() to authenticated;
create function marketplace.admin_access() returns boolean language sql stable security invoker set search_path='' as $$select marketplace_private.is_admin()$$;
revoke all on function marketplace.admin_access() from public,anon,authenticated;
grant execute on function marketplace.admin_access() to authenticated;
create policy admin_profiles_read on marketplace.profiles for select to authenticated using ((select marketplace_private.is_admin()));
create policy admin_listings_read on marketplace.listings for select to authenticated using ((select marketplace_private.is_admin()));
grant select on marketplace.seller_approvals,marketplace.moderation_log to authenticated;
create policy admin_approvals_read on marketplace.seller_approvals for select to authenticated using ((select marketplace_private.is_admin()));
create policy admin_log_read on marketplace.moderation_log for select to authenticated using ((select marketplace_private.is_admin()));
create policy admin_photo_read on storage.objects for select to authenticated using (bucket_id='ao-listing-photos' and (select marketplace_private.is_admin()) and exists(select 1 from marketplace.listings l where l.status in ('pending','published','rejected') and name ~ ('^'||l.seller_id::text||'/'||l.id::text||'/[1-8]\.jpg$')));
create function marketplace_private.moderate_seller(target uuid,action text,reason text) returns void language plpgsql security definer set search_path='' as $$
begin
if not marketplace_private.is_admin() then raise exception 'Admin access required' using errcode='42501';end if;
if action not in ('approve','suspend') or action is null or (action='suspend' and coalesce(length(trim(reason)),0)=0) or length(coalesce(reason,''))>500 then raise exception 'Invalid action or reason';end if;
perform 1 from marketplace.profiles where user_id=target for update;
if not found then raise exception 'Seller not found';end if;
if action='approve' then
if not exists(select 1 from auth.users where id=target and email_confirmed_at is not null and not is_anonymous) then raise exception 'Seller must be verified';end if;
insert into marketplace.seller_approvals(user_id) values(target) on conflict(user_id) do update set revoked_at=null,approved_at=now();
else
insert into marketplace.seller_approvals(user_id,revoked_at) values(target,now()) on conflict(user_id) do update set revoked_at=now();
update marketplace.listings set status='withdrawn' where seller_id=target and status='published';
end if;
insert into marketplace.moderation_log(actor_id,entity_type,entity_id,action,reason) values(auth.uid(),'seller',target,action,nullif(trim(reason),''));
end $$;
create function marketplace_private.moderate_listing(target uuid,action text,expected_updated_at timestamptz,reason text) returns void language plpgsql security definer set search_path='' as $$
declare l marketplace.listings%rowtype; owner_id uuid;
begin
if not marketplace_private.is_admin() then raise exception 'Admin access required' using errcode='42501';end if;
if action not in ('approve','reject','remove') or action is null or (action in ('reject','remove') and coalesce(length(trim(reason)),0)=0) or length(coalesce(reason,''))>500 then raise exception 'Invalid action or reason';end if;
select seller_id into owner_id from marketplace.listings where id=target;
if not found then raise exception 'Listing not found';end if;
perform 1 from marketplace.profiles where user_id=owner_id for update;
select * into l from marketplace.listings where id=target for update;
if not found or l.updated_at is distinct from expected_updated_at then raise exception 'Listing changed; refresh before reviewing';end if;
if action='approve' then
if l.status<>'pending' or not marketplace_private.seller_is_approved(l.seller_id) then raise exception 'Pending listing and approved seller required';end if;
update marketplace.listings set status='published',expires_at=now()+interval '30 days' where id=target;
elsif action='reject' then
if l.status<>'pending' then raise exception 'Pending listing required';end if;
update marketplace.listings set status='rejected' where id=target;
else
if l.status<>'published' then raise exception 'Published listing required';end if;
update marketplace.listings set status='withdrawn' where id=target;
end if;
insert into marketplace.moderation_log(actor_id,entity_type,entity_id,action,reason) values(auth.uid(),'listing',target,action,nullif(trim(reason),''));
end $$;
revoke all on function marketplace_private.moderate_seller(uuid,text,text),marketplace_private.moderate_listing(uuid,text,timestamptz,text) from public,anon,authenticated;
grant execute on function marketplace_private.moderate_seller(uuid,text,text),marketplace_private.moderate_listing(uuid,text,timestamptz,text) to authenticated;
create function marketplace.admin_moderate_seller(target uuid,action text,reason text) returns void language sql security invoker set search_path='' as $$select marketplace_private.moderate_seller(target,action,reason)$$;
create function marketplace.admin_moderate_listing(target uuid,action text,expected_updated_at timestamptz,reason text) returns void language sql security invoker set search_path='' as $$select marketplace_private.moderate_listing(target,action,expected_updated_at,reason)$$;
revoke all on function marketplace.admin_moderate_seller(uuid,text,text),marketplace.admin_moderate_listing(uuid,text,timestamptz,text) from public,anon,authenticated;
grant execute on function marketplace.admin_moderate_seller(uuid,text,text),marketplace.admin_moderate_listing(uuid,text,timestamptz,text) to authenticated;
commit;