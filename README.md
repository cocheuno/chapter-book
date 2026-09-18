# Chapter Book

The chapter’s book of people, partners, Gold Masses, and conferences — plus a public site desk for events, articles, documents, and courses.

Built for a Society of Catholic Scientists chapter that found commercial CRMs too large.

## In this repository

- **Code** for Chapter Book
- **[Design freeze](docs/DESIGN.md)** — V1 decisions
- **[Privacy](docs/PRIVACY.md)** — what may be public, and what must never be committed
- **[Review](docs/REVIEW.md)** — architecture and functionality vs the Wisconsin chapter’s needs
- **[Hosting](docs/HOSTING.md)** — Neon + Vercel; secrets stay in the host environment

This repository is meant to be **public**. Real members, passwords, and host secrets are **not** in git. They live in the chapter’s database and in the host’s environment. Read [docs/PRIVACY.md](docs/PRIVACY.md) before you add a file.

## Run locally

Needs Node 22.12 or newer (Vite 8). Then:

```
npm install
npm run dev
```

Opens at http://localhost:8080. With no `DATABASE_URL`, the book uses an embedded Postgres (PGLite). An empty book allows one founder admin; after that, operators are invite-only (Chapter → Operators). People, partners, and gatherings start empty — enter them in the live book, not in git. The live public site stays at scs-wisconsin-usa.org.

Do not create a committed `.env`. Host secrets (`DATABASE_URL`, `BETTER_AUTH_SECRET`) stay in the host environment. `.env.example` lists the names only.

## Using the book

Sign in as chapter leadership (invite-only). Visitors who only want Mass times and articles use the public chapter site (no CRM account). Two-factor sign-in from the chapter website is planned; it is not in this version.

Public-site sample copy on the Website desk follows the Wisconsin chapter’s already-public pages. Membership rows are not in this repository.
