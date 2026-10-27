BEGIN;
CREATE SCHEMA IF NOT EXISTS "public";
CREATE TYPE "public"."UserRole" AS ENUM ('USER', 'ADMIN');
CREATE TABLE "public"."users" (
  "id" UUID NOT NULL,
  "email" TEXT NOT NULL,
  "name" TEXT,
  "authUserId" UUID,
  "nickname" TEXT,
  "nicknameKey" TEXT,
  "role" "public"."UserRole" NOT NULL DEFAULT 'USER',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "users_email_key" ON "public"."users"("email");
CREATE UNIQUE INDEX "users_authUserId_key" ON "public"."users"("authUserId");
CREATE UNIQUE INDEX "users_nicknameKey_key" ON "public"."users"("nicknameKey");
ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "public"."users" FROM anon, authenticated;
COMMIT;
