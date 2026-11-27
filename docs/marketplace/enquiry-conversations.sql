begin;
create table marketplace.enquiry_replies(
 id uuid primary key default gen_random_uuid(),
 enquiry_id uuid not null references marketplace.enquiries(id) on delete cascade,
 sender_id uuid not null references auth.users(id) on delete cascade,
 message text not null check(char_length(trim(message)) between 1 and 1000),
 created_at timestamptz not null default clock_timestamp()
);
create index enquiry_replies_thread_idx on marketplace.enquiry_replies(enquiry_id,created_at,id);
create index enquiry_replies_sender_idx on marketplace.enquiry_replies(sender_id,created_at desc);
create table marketplace.enquiry_reads(
 enquiry_id uuid not null references marketplace.enquiries(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 read_through timestamptz not null,
 primary key(enquiry_id,user_id)
);
alter table marketplace.enquiry_replies enable row level security;
alter table marketplace.enquiry_reads enable row level security;
revoke all on marketplace.enquiry_replies,marketplace.enquiry_reads from public,anon,authenticated;
grant select on marketplace.enquiry_replies,marketplace.enquiry_reads to authenticated;
grant all on marketplace.enquiry_replies,marketplace.enquiry_reads to service_role;
create policy reply_participant_read on marketplace.enquiry_replies for select to authenticated using (
 (select marketplace_private.verified_user()) and exists(select 1 from marketplace.enquiries e join marketplace.listings l on l.id=e.listing_id where e.id=enquiry_id and ((select auth.uid())=e.buyer_id or (select auth.uid())=l.seller_id))
);
create policy receipt_own_read on marketplace.enquiry_reads for select to authenticated using(
 user_id=(select auth.uid()) and (select marketplace_private.verified_user())
);
create function marketplace_private.reply_to_enquiry(target uuid,body text) returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); result uuid;
begin
 if uid is null or not marketplace_private.verified_user() then raise exception 'Verified account required' using errcode='42501';end if;
 if not exists(select 1 from marketplace.enquiries e join marketplace.listings l on l.id=e.listing_id where e.id=target and uid in (e.buyer_id,l.seller_id)) then raise exception 'Conversation unavailable' using errcode='42501';end if;
 if body is null or length(trim(body)) not between 1 and 1000 then raise exception 'Message must contain 1-1000 characters';end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,43));
 if (select count(*) from marketplace.enquiry_replies where sender_id=uid and created_at>now()-interval '1 hour')>=20 then raise exception 'Hourly reply limit reached';end if;
 insert into marketplace.enquiry_replies(enquiry_id,sender_id,message) values(target,uid,trim(body)) returning id into result;return result;
end $$;
create function marketplace_private.mark_enquiry_read(target uuid,seen_at timestamptz) returns void language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); latest timestamptz;
begin
 if uid is null or not marketplace_private.verified_user() then raise exception 'Verified account required' using errcode='42501';end if;
 select greatest(e.created_at,coalesce((select max(r.created_at) from marketplace.enquiry_replies r where r.enquiry_id=e.id),e.created_at)) into latest
 from marketplace.enquiries e join marketplace.listings l on l.id=e.listing_id where e.id=target and uid in(e.buyer_id,l.seller_id);
 if not found then raise exception 'Conversation unavailable' using errcode='42501';end if;
 if seen_at is null or seen_at>latest or seen_at>clock_timestamp() then raise exception 'Invalid read timestamp';end if;
 insert into marketplace.enquiry_reads(enquiry_id,user_id,read_through) values(target,uid,seen_at) on conflict(enquiry_id,user_id) do update set read_through=greatest(marketplace.enquiry_reads.read_through,excluded.read_through);
end $$;
revoke all on function marketplace_private.reply_to_enquiry(uuid,text),marketplace_private.mark_enquiry_read(uuid,timestamptz) from public,anon,authenticated;
grant execute on function marketplace_private.reply_to_enquiry(uuid,text),marketplace_private.mark_enquiry_read(uuid,timestamptz) to authenticated;
create function marketplace.reply_to_enquiry(target uuid,body text) returns uuid language sql security invoker set search_path='' as $$select marketplace_private.reply_to_enquiry(target,body)$$;
create function marketplace.mark_enquiry_read(target uuid,seen_at timestamptz) returns void language sql security invoker set search_path='' as $$select marketplace_private.mark_enquiry_read(target,seen_at)$$;
revoke all on function marketplace.reply_to_enquiry(uuid,text),marketplace.mark_enquiry_read(uuid,timestamptz) from public,anon,authenticated;
grant execute on function marketplace.reply_to_enquiry(uuid,text),marketplace.mark_enquiry_read(uuid,timestamptz) to authenticated;
commit;