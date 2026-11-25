begin;
create policy listing_own_cancel_pending on marketplace.listings for update to authenticated
using(seller_id=(select auth.uid()) and status='pending')
with check(seller_id=(select auth.uid()) and status='withdrawn');
create function marketplace_private.guard_pending_cancel() returns trigger
language plpgsql set search_path='' as $$
begin
 if current_user='authenticated' and old.status='pending' then
  if new.status<>'withdrawn' or (to_jsonb(new)-'status'-'updated_at') is distinct from (to_jsonb(old)-'status'-'updated_at') then
   raise exception 'Pending listings may only be withdrawn unchanged' using errcode='42501';
  end if;
 end if;
 return new;
end $$;
revoke all on function marketplace_private.guard_pending_cancel() from public,anon,authenticated;
create trigger listing_cancel_guard before update on marketplace.listings for each row execute function marketplace_private.guard_pending_cancel();
commit;