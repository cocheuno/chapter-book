-- Public picture address for a shelf item. On a conference event this is the
-- venue photo. On a talk it is the speaker headshot. Editors paste an https
-- address; the shelf does not store the file itself.
alter table site_items add column if not exists image_url text;
