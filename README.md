# Chapter Book

The chapter’s book of people, partners, Gold Masses, and conferences — plus a public site desk for events, articles, documents, and courses.

Built for a Society of Catholic Scientists chapter that found commercial CRMs too large.

## In this repository

- **Code** for Chapter Book
- **[Design freeze](docs/DESIGN.md)** — V1 decisions
- **[Privacy](docs/PRIVACY.md)** — what may be public, and what must never be committed
- **[Review](docs/REVIEW.md)** — architecture and functionality vs the Wisconsin chapter’s needs; do not stand up hosts until that freeze is agreed

This repository is meant to be **public**. Real members, passwords, and host secrets are **not** in git. They live in the chapter’s database and in the host’s environment. Read [docs/PRIVACY.md](docs/PRIVACY.md) before you add a file.

## Run locally

Needs Node 22.12 or newer (Vite 8). Then:

```
npm install
npm run dev
```

Opens at http://localhost:8080. With no `DATABASE_URL`, the book uses an embedded Postgres (PGLite). First sign-in seeds fictional Santa Fe names (`.example` emails). Visitors use `/site` with no account.

Do not create a committed `.env`. Host secrets (`DATABASE_URL`, `BETTER_AUTH_SECRET`) stay in the host environment. `.env.example` lists the names only.

## Using the book

Sign in as chapter leadership. Visitors who only want Mass times and articles use the public chapter site (no account). Two-factor sign-in from the chapter website is planned; it is not in this version.

Demo data on first sign-in is fictional (Santa Fe names, `.example` emails). Public-site sample copy follows the Wisconsin chapter’s already-public pages.
