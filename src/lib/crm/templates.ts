export type MailTemplateSeed = {
  key: string;
  name: string;
  audienceHint: string;
  eventTypeKey: string | null;
  subject: string;
  body: string;
};

export const MAIL_TEMPLATE_SEEDS: MailTemplateSeed[] = [
  {
    key: "gold_mass_invite",
    name: "Gold Mass invitation",
    audienceHint: "event_guests",
    eventTypeKey: "gold_mass",
    subject: "Gold Mass for scientists — {{event_date}} at {{venue_name}}",
    body: `Dear {{honorific}} {{family_name}},

The {{chapter_name}} invites you to a Gold Mass for scientists and science educators.

{{event_title}}
{{event_date}} at {{event_time}}
{{venue_name}} {{venue_detail}}

A Gold Mass is a Mass for those who work in the sciences, in the tradition of the Red Mass for lawyers. It is usually a votive Mass of St. Albert the Great, patron of scientists.

{{rsvp_line}}

With gratitude,
{{chapter_name}}
{{chapter_contact}}`,
  },
  {
    key: "gold_mass_reminder",
    name: "Gold Mass reminder",
    audienceHint: "event_guests",
    eventTypeKey: "gold_mass",
    subject: "Reminder: Gold Mass on {{event_date}}",
    body: `Dear {{honorific}} {{family_name}},

A brief reminder of our Gold Mass:

{{event_title}}
{{event_date}} at {{event_time}}
{{venue_name}}

{{rsvp_line}}

{{chapter_name}}`,
  },
  {
    key: "bulletin_blurb",
    name: "Parish bulletin blurb",
    audienceHint: "parish_secretaries",
    eventTypeKey: "gold_mass",
    subject: "Bulletin notice: Gold Mass for scientists, {{event_date}}",
    body: `Dear {{honorific}} {{family_name}},

Would you be willing to place the following notice in the bulletin at {{org_or_school_name}}?

— {{chapter_name}}

----- bulletin text -----

GOLD MASS FOR SCIENTISTS
{{event_title}}
{{event_date}} at {{event_time}}, {{venue_name}} {{venue_detail}}

The Society of Catholic Scientists invites scientists, science teachers, students, and all who care about faith and reason. All are welcome.

{{chapter_contact}}`,
  },
  {
    key: "school_faculty_invite",
    name: "School faculty invitation",
    audienceHint: "school_doors",
    eventTypeKey: "gold_mass",
    subject: "Gold Mass for scientists — please tell your faculty and advanced students",
    body: `Dear {{honorific}} {{family_name}},

I am writing to you as {{role_at_institution}} at {{org_or_school_name}}.

The {{chapter_name}} will celebrate a Gold Mass for scientists and science educators:

{{event_title}}
{{event_date}} at {{event_time}}
{{venue_name}} {{venue_detail}}

Would you be willing to mention this to your science faculty, and, if appropriate, to advanced students? If a group from {{org_or_school_name}} might come, a rough number helps us reserve seats.

{{rsvp_line}}

Thank you for the work you do with your students.

{{chapter_name}}
{{chapter_contact}}`,
  },
  {
    key: "school_group_followup",
    name: "School group follow-up",
    audienceHint: "school_doors",
    eventTypeKey: "gold_mass",
    subject: "May we reserve seats for {{org_or_school_name}} at the Gold Mass?",
    body: `Dear {{honorific}} {{family_name}},

Thank you for being willing to let {{org_or_school_name}} know about our Gold Mass on {{event_date}}.

If you expect to bring students or faculty, a rough number helps us with seating and food.

{{chapter_name}}`,
  },
  {
    key: "thank_celebrant",
    name: "Thank the celebrant",
    audienceHint: "manual",
    eventTypeKey: "gold_mass",
    subject: "Thank you for celebrating our Gold Mass",
    body: `Dear {{honorific}} {{family_name}},

Thank you for celebrating the Gold Mass for the {{chapter_name}} on {{event_date}} at {{venue_name}}.

Please let us know if we may invite you again next year.

With gratitude,
{{chapter_name}}
{{chapter_contact}}`,
  },
  {
    key: "thank_host_parish",
    name: "Thank the host parish",
    audienceHint: "parish_secretaries",
    eventTypeKey: "gold_mass",
    subject: "Thank you for hosting the Gold Mass at {{org_or_school_name}}",
    body: `Dear {{honorific}} {{family_name}},

Thank you for welcoming the {{chapter_name}} to {{org_or_school_name}} for our Gold Mass on {{event_date}}.

{{chapter_name}}
{{chapter_contact}}`,
  },
  {
    key: "thank_school",
    name: "Thank a school",
    audienceHint: "school_doors",
    eventTypeKey: "gold_mass",
    subject: "Thank you — {{org_or_school_name}} at the Gold Mass",
    body: `Dear {{honorific}} {{family_name}},

Thank you for helping {{org_or_school_name}} take part in our Gold Mass on {{event_date}}.

{{chapter_name}}`,
  },
  {
    key: "conference_invite",
    name: "Conference invitation",
    audienceHint: "event_guests",
    eventTypeKey: "conference",
    subject: "{{event_title}} — {{event_date}}",
    body: `Dear {{honorific}} {{family_name}},

The {{chapter_name}} invites you to our regional conference on science and the Catholic faith.

{{event_title}}
{{event_date}} at {{event_time}}
{{venue_name}} {{venue_detail}}

{{rsvp_line}}

{{chapter_name}}
{{chapter_contact}}`,
  },
  {
    key: "blank",
    name: "Blank letter",
    audienceHint: "any",
    eventTypeKey: null,
    subject: "",
    body: `Dear {{honorific}} {{family_name}},



{{chapter_name}}`,
  },
];
