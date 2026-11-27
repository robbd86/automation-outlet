begin;
create function marketplace_private.enquiry_participant(target uuid) returns boolean language sql stable security definer set search_path='' as $$
select marketplace_private.verified_user() and exists(select 1 from marketplace.enquiries e join marketplace.listings l on l.id=e.listing_id where e.id=target and (select auth.uid()) in(e.buyer_id,l.seller_id))
$$;
revoke all on function marketplace_private.enquiry_participant(uuid) from public,anon,authenticated;
grant execute on function marketplace_private.enquiry_participant(uuid) to authenticated;
drop policy reply_participant_read on marketplace.enquiry_replies;
create policy reply_participant_read on marketplace.enquiry_replies for select to authenticated using (marketplace_private.enquiry_participant(enquiry_id));
commit;