begin;
create or replace function marketplace_private.guard_pending_cancel() returns trigger language plpgsql set search_path='' as $$
begin
 if current_user='authenticated' and old.status='pending' then
 if new.status<>'withdrawn' or (to_jsonb(new)-'status'-'updated_at'-'part_key') is distinct from (to_jsonb(old)-'status'-'updated_at'-'part_key') then
 raise exception 'Pending listings may only be withdrawn unchanged' using errcode='42501';
 end if; end if; return new;
end $$;
commit;