begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('ao-listing-photos','ao-listing-photos',false,2097152,array['image/jpeg']);
create policy ao_photo_own_read on storage.objects for select to authenticated using (
 bucket_id='ao-listing-photos' and (select marketplace_private.verified_user()) and
 exists(select 1 from marketplace.listings l where l.seller_id=(select auth.uid()) and name ~ ('^'||l.seller_id::text||'/'||l.id::text||'/[1-8]\.jpg$'))
);
create policy ao_photo_own_create on storage.objects for insert to authenticated with check (
 bucket_id='ao-listing-photos' and (select marketplace_private.verified_user()) and
 exists(select 1 from marketplace.listings l where l.seller_id=(select auth.uid()) and l.status='draft' and name ~ ('^'||l.seller_id::text||'/'||l.id::text||'/[1-8]\.jpg$'))
);
create policy ao_photo_own_remove on storage.objects for delete to authenticated using (
 bucket_id='ao-listing-photos' and (select marketplace_private.verified_user()) and
 exists(select 1 from marketplace.listings l where l.seller_id=(select auth.uid()) and l.status='draft' and name ~ ('^'||l.seller_id::text||'/'||l.id::text||'/[1-8]\.jpg$'))
);
commit;