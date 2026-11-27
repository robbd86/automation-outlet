begin;
-- Buyer photos remain authenticated-only while this is a protected test.
create policy ao_photo_buyer_read on storage.objects for select to authenticated using (
 bucket_id='ao-listing-photos' and (select marketplace_private.verified_user()) and
 exists(select 1 from marketplace.listings l where l.status='published' and l.expires_at>now()
 and marketplace_private.seller_is_approved(l.seller_id)
 and name ~ ('^'||l.seller_id::text||'/'||l.id::text||'/[1-8]\.jpg$'))
);
create index marketplace_enquiry_buyer_time_idx on marketplace.enquiries(buyer_id,created_at desc);
create function marketplace_private.send_enquiry(target uuid,body text) returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); result uuid; l marketplace.listings%rowtype;
begin
 if uid is null or not marketplace_private.verified_user() then raise exception 'Verified account required' using errcode='42501';end if;
 if body is null or length(trim(body)) not between 1 and 1000 then raise exception 'Message must contain 1-1000 characters';end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,42));
 select * into l from marketplace.listings where id=target for share;
 if not found or l.status<>'published' or l.expires_at is null or l.expires_at<=now() or not marketplace_private.seller_is_approved(l.seller_id) then raise exception 'Listing unavailable';end if;
 if l.seller_id=uid then raise exception 'You cannot enquire about your own listing';end if;
 if (select count(*) from marketplace.enquiries where buyer_id=uid and created_at>now()-interval '1 hour')>=5 then raise exception 'Hourly enquiry limit reached';end if;
 if exists(select 1 from marketplace.enquiries where buyer_id=uid and listing_id=target and created_at>now()-interval '5 minutes') then raise exception 'Please wait before contacting this seller again';end if;
 insert into marketplace.enquiries(listing_id,buyer_id,message) values(target,uid,trim(body)) returning id into result;return result;
end $$;
revoke all on function marketplace_private.send_enquiry(uuid,text) from public,anon,authenticated;
grant execute on function marketplace_private.send_enquiry(uuid,text) to authenticated;
create function marketplace.send_enquiry(target uuid,body text) returns uuid language sql security invoker set search_path='' as $$select marketplace_private.send_enquiry(target,body)$$;
revoke all on function marketplace.send_enquiry(uuid,text) from public,anon,authenticated;
grant execute on function marketplace.send_enquiry(uuid,text) to authenticated;
commit;