-- Each Better Auth user gets a unique URL slug. Their pages live under this as
-- the first path segment (e.g. /<username>/explainers/foo.html). Nullable so a
-- freshly-created account can exist before the slug is chosen on first login;
-- the unique index ignores NULLs in SQLite, so multiple slug-less users are ok.
ALTER TABLE "user" ADD COLUMN "username" text;
CREATE UNIQUE INDEX "user_username_idx" ON "user" ("username");
