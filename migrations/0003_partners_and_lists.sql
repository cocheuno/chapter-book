-- Fold schools into organizations. Add admin-maintained lookup lists.

alter table persons add column if not exists religious_title text;
alter table persons add column if not exists academic_title text;
alter table persons add column if not exists state text;
alter table persons add column if not exists country text;

update persons set religious_title = honorific
  where religious_title is null
    and honorific in ('Fr.', 'Sr.', 'Br.', 'Rev.', 'Very Rev.', 'Msgr.', 'Deacon', 'Dcn.', 'Most Rev.', 'Bishop', 'Abbot', 'Mother', 'Cardinal', 'Pope', 'Rev. Dr.');
update persons set academic_title = honorific
  where academic_title is null
    and honorific in ('Dr.', 'Prof.', 'Prof. Dr.', 'Ph.D.', 'M.D.', 'Sc.D.', 'M.Sc.', 'M.A.', 'B.S.');
update persons set country = 'United States' where country is null;

alter table organizations add column if not exists state text;
alter table organizations add column if not exists country text;
alter table organizations add column if not exists preferred_door text;
alter table organizations add column if not exists science_dept_notes text;
alter table organizations add column if not exists can_bus_students text;
alter table organizations add column if not exists academic_calendar_notes text;
alter table organizations add column if not exists enrollment integer;
alter table organizations add column if not exists grades_served text;
alter table organizations add column if not exists notes text;

update organizations set country = 'United States' where country is null;

update organizations o set
  preferred_door = coalesce(o.preferred_door, s.preferred_door),
  science_dept_notes = coalesce(o.science_dept_notes, s.science_dept_notes),
  can_bus_students = coalesce(o.can_bus_students, s.can_bus_students),
  academic_calendar_notes = coalesce(o.academic_calendar_notes, s.academic_calendar_notes),
  enrollment = coalesce(o.enrollment, s.enrollment),
  grades_served = coalesce(o.grades_served, s.grades_served),
  notes = coalesce(o.notes, s.notes),
  last_touch_at = coalesce(o.last_touch_at, s.last_touch_at)
from schools s
where s.organization_id = o.id;

update affiliations a set
  organization_id = s.organization_id,
  school_id = null,
  target_type = 'organization'
from schools s
where a.school_id = s.id;

update participations p set
  organization_id = coalesce(p.organization_id, s.organization_id),
  school_id = null,
  party_type = case when p.party_type = 'school' then 'organization' else p.party_type end
from schools s
where p.school_id = s.id;

update touches t set
  organization_id = coalesce(t.organization_id, s.organization_id),
  school_id = null
from schools s
where t.school_id = s.id;

update tasks t set
  organization_id = coalesce(t.organization_id, s.organization_id),
  school_id = null
from schools s
where t.school_id = s.id;

update mailing_skips m set
  organization_id = coalesce(m.organization_id, s.organization_id),
  school_id = null,
  party_type = case when m.party_type = 'school' then 'organization' else m.party_type end
from schools s
where m.school_id = s.id;

update mail_messages m set
  organization_id = coalesce(m.organization_id, s.organization_id),
  school_id = null,
  recipient_kind = case when m.recipient_kind = 'school_main' then 'org_main' else m.recipient_kind end
from schools s
where m.school_id = s.id;

drop index if exists aff_school_idx;
drop index if exists touches_school_idx;
drop index if exists schools_chapter_idx;
drop index if exists schools_diocese_idx;

alter table affiliations drop column if exists school_id;
alter table participations drop column if exists school_id;
alter table touches drop column if exists school_id;
alter table tasks drop column if exists school_id;
alter table mailing_skips drop column if exists school_id;
alter table mail_messages drop column if exists school_id;

drop table if exists schools;

create table if not exists list_items (
  id text primary key,
  chapter_id text not null references chapters (id),
  list_key text not null,
  value text not null,
  sort_order integer not null default 0,
  active boolean not null default true
);

create unique index if not exists list_items_uq
  on list_items (chapter_id, list_key, lower(value));
create index if not exists list_items_lookup_idx
  on list_items (chapter_id, list_key, sort_order);
