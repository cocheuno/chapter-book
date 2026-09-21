# Publish Website-desk copy to scs-wisconsin-usa.org

Leadership edits **Website** in Chapter Book. Only items marked **published** leave the book. CRM people never appear on the public site.

## What to paste on GoDaddy

In the HTML for http://scs-wisconsin-usa.org/ (once):

```html
<script src="https://chapter-book-beryl.vercel.app/embed/chapter-site.js" defer></script>
```

Then mark the spots that should fill from the book:

```html
<h1 data-scs="title"></h1>
<p data-scs="tagline"></p>
<p data-scs="about"></p>
<div data-scs-list="announcement"></div>
<div data-scs-list="event"></div>
<div data-scs-list="article"></div>
<div data-scs-list="document"></div>
<div data-scs-list="course"></div>
```

You can keep existing GoDaddy chrome (header, colors, footer **For Members**). Replace only the inner content regions with those `data-scs` hooks. If the script cannot load, the old markup stays.

## How editors publish

1. Sign in to Chapter Book → **Website**.
2. Save **Masthead**.
3. Add or edit Events / Announcements / Articles / Documents / Courses.
4. Leave **Published** checked. Uncheck to pull an item off the public site.
5. Within about a minute, refresh scs-wisconsin-usa.org.

JSON feed (for debugging): `https://chapter-book-beryl.vercel.app/api/public-site`

Preview (not the GoDaddy homepage): `https://chapter-book-beryl.vercel.app/site`

## CORS

The feed allows `scs-wisconsin-usa.org` (http and https, www or not). It does not expose People, Partners, or Invites.
