-- AO Marketplace: proposed isolated Supabase development schema.
-- NOT applied. Review in a new empty development project only.
-- Never run against the existing AO stock, checkout or customer systems.
-- Public data is deliberately separated from private user/contact records.
begin;
create schema marketplace; -- fail if the schema already exists; no overwrite
revoke all on schema marketplace from public;
grant usage on schema marketplace to anon, authenticated, service_role;
create table marketplace.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 1 and 100),
  company_name text not null check (char_length(trim(company_name)) between 1 and 160),
  region text not null check (char_length(trim(region)) between 1 and 100),
  created_at timestamptz not null default now()
);
-- Server-maintained approval records. Not writable by sellers.
create table marketplace.seller_approvals (
  user_id uuid primary key references marketplace.profiles(user_id) on delete cascade,
  approved_at timestamptz not null default now(),
  revoked_at timestamptz
);
create table marketplace.listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references marketplace.profiles(user_id) on delete cascade default auth.uid(),
  manufacturer text not null check (char_length(trim(manufacturer)) between 1 and 80),
  part_number text not null check (char_length(trim(part_number)) between 1 and 100),
  part_key text generated always as (regexp_replace(upper(part_number),'[^A-Z0-9]','','g')) stored,
  title text not null check (char_length(trim(title)) between 1 and 140),
  category text not null check (category in ('PLC / CPU','HMI','Drives','Safety','I/O modules','Sensors','Other')),
  condition text not null check (condition in ('New sealed','New boxed','New surplus','Refurbished','Used tested','Used untested','Spares or repair')),
  description text not null check (char_length(trim(description)) between 1 and 2000),
  price_pence integer not null check (price_pence between 1 and 100000000),
  quantity integer not null check (quantity between 1 and 10000),
  vat_treatment text not null check (vat_treatment in ('Not applicable','VAT included','VAT excluded')),
  delivery text not null check (delivery in ('Courier or collection','Courier only','Collection only')),
  region text not null check (char_length(trim(region)) between 1 and 100),
  status text not null default 'draft' check (status in ('draft','pending','published','rejected','sold','withdrawn')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz,
  check (char_length(part_key)>0)
);
create index marketplace_listing_part_idx on marketplace.listings(part_key);
create index marketplace_listing_filter_idx on marketplace.listings(status,category,manufacturer,price_pence);
create index marketplace_listing_owner_idx on marketplace.listings(seller_id);
create table marketplace.listing_images (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references marketplace.listings(id) on delete cascade,
  storage_path text not null unique,
  position smallint not null check(position between 1 and 8),
  unique(listing_id,position)
);
create table marketplace.enquiries (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references marketplace.listings(id) on delete cascade,
  buyer_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  message text not null check(char_length(trim(message)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index marketplace_enquiry_listing_idx on marketplace.enquiries(listing_id);
create table marketplace.wanted_parts (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  part_number text not null check(char_length(trim(part_number)) between 1 and 100),
  quantity integer not null check(quantity between 1 and 10000),
  urgency text not null check(urgency in ('Within 48 hours','Within 7 days','Flexible')),
  budget_pence integer check(budget_pence between 0 and 100000000),
  status text not null default 'draft' check(status in ('draft','pending','published','closed','rejected')),
  created_at timestamptz not null default now(),
  expires_at timestamptz
);
create table marketplace.moderation_log (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  entity_type text not null check(entity_type in ('listing','seller','wanted')),
  entity_id uuid not null,
  action text not null,
  reason text,
  created_at timestamptz not null default now()
);
-- Approval is a server-only capability. SECURITY DEFINER has fixed search_path.
create function marketplace.seller_is_approved(uid uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select exists(select 1 from marketplace.seller_approvals a where a.user_id=uid and a.revoked_at is null) $$;
revoke all on function marketplace.seller_is_approved(uuid) from public;
grant execute on function marketplace.seller_is_approved(uuid) to anon, authenticated, service_role;
alter table marketplace.profiles enable row level security;
alter table marketplace.seller_approvals enable row level security;
alter table marketplace.listings enable row level security;
alter table marketplace.listing_images enable row level security;
alter table marketplace.enquiries enable row level security;
alter table marketplace.wanted_parts enable row level security;
alter table marketplace.moderation_log enable row level security;
revoke all on all tables in schema marketplace from public, anon, authenticated;
-- No public access to profiles or raw wanted rows (which contain buyer IDs).
grant select on marketplace.profiles to authenticated;
grant insert (user_id,display_name,company_name,region) on marketplace.profiles to authenticated;
grant update (display_name,company_name,region) on marketplace.profiles to authenticated;
create policy profile_read on marketplace.profiles for select to authenticated using(user_id=(select auth.uid()));
create policy profile_insert on marketplace.profiles for insert to authenticated with check(user_id=(select auth.uid()));
create policy profile_update on marketplace.profiles for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
-- Listings contain public advert data only; do not add seller contacts to this table.
grant select on marketplace.listings to anon,authenticated;
grant insert (seller_id,manufacturer,part_number,title,category,condition,description,price_pence,quantity,vat_treatment,delivery,region) on marketplace.listings to authenticated;
grant update (manufacturer,part_number,title,category,condition,description,price_pence,quantity,vat_treatment,delivery,region,status) on marketplace.listings to authenticated;
create policy listing_visible on marketplace.listings for select to anon,authenticated using(status='published' and expires_at>now() and marketplace.seller_is_approved(seller_id));
create policy listing_own_read on marketplace.listings for select to authenticated using(seller_id=(select auth.uid()));
create policy listing_own_create on marketplace.listings for insert to authenticated with check(seller_id=(select auth.uid()) and status='draft');
create policy listing_own_edit on marketplace.listings for update to authenticated
using(seller_id=(select auth.uid()) and status in ('draft','rejected','withdrawn'))
with check(seller_id=(select auth.uid()) and status in ('draft','pending','withdrawn'));
-- Pending and published listings are locked against direct seller edits. A future
-- reviewed server endpoint may withdraw them; moderation must approve the locked
-- revision and set an expiry atomically. Clients cannot directly publish.
create function marketplace.touch_listing() returns trigger
language plpgsql set search_path='' as $$ begin new.updated_at=now(); return new; end $$;
create trigger listing_updated before update on marketplace.listings for each row execute function marketplace.touch_listing();
grant select on marketplace.listing_images to authenticated,anon;
grant insert(listing_id,storage_path,position),delete on marketplace.listing_images to authenticated;
create policy image_visible on marketplace.listing_images for select to anon,authenticated using(exists(select 1 from marketplace.listings l where l.id=listing_id and l.status='published' and l.expires_at>now() and marketplace.seller_is_approved(l.seller_id)));
create policy image_own_read on marketplace.listing_images for select to authenticated using(exists(select 1 from marketplace.listings l where l.id=listing_id and l.seller_id=(select auth.uid())));
create policy image_own_create on marketplace.listing_images for insert to authenticated with check(exists(select 1 from marketplace.listings l where l.id=listing_id and l.seller_id=(select auth.uid()) and l.status='draft' and storage_path like l.seller_id::text||'/'||l.id::text||'/%'));
create policy image_own_remove on marketplace.listing_images for delete to authenticated using(exists(select 1 from marketplace.listings l where l.id=listing_id and l.seller_id=(select auth.uid()) and l.status='draft'));
-- Storage bucket and object policies intentionally not provisioned: use private
-- objects and signed read URLs after server-side file inspection in a later stage.
-- Enquiry sending must go through a rate-limited authenticated server endpoint.
grant select on marketplace.enquiries to authenticated;
create policy enquiry_participants on marketplace.enquiries for select to authenticated using(buyer_id=(select auth.uid()) or exists(select 1 from marketplace.listings l where l.id=listing_id and l.seller_id=(select auth.uid())));
grant select on marketplace.wanted_parts to authenticated;
grant insert (buyer_id,part_number,quantity,urgency,budget_pence) on marketplace.wanted_parts to authenticated;
grant update(part_number,quantity,urgency,budget_pence,status) on marketplace.wanted_parts to authenticated;
create policy wanted_own_read on marketplace.wanted_parts for select to authenticated using(buyer_id=(select auth.uid()));
create policy wanted_own_create on marketplace.wanted_parts for insert to authenticated with check(buyer_id=(select auth.uid()) and status='draft' and expires_at is null);
create policy wanted_own_edit on marketplace.wanted_parts for update to authenticated using(buyer_id=(select auth.uid()) and status in ('draft','rejected')) with check(buyer_id=(select auth.uid()) and status in ('draft','pending','closed'));
-- Public wanted feed will be implemented through an allowlisted endpoint, not raw row grants.
-- Moderation, enquiry delivery, verification, storage and public feed remain server-only.
grant all on all tables in schema marketplace to service_role;
grant usage,select on all sequences in schema marketplace to service_role;
-- Explicit function permissions: touch_listing is a trigger, not an API endpoint.
revoke all on function marketplace.touch_listing() from public,anon,authenticated;
commit;
