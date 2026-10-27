BEGIN;

CREATE TYPE "public"."ReservationStatus"
  AS ENUM ('CONFIRMED', 'CANCELLED');

CREATE TABLE "public"."reservations" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "classroomId" UUID NOT NULL,
  "startAt" TIMESTAMPTZ(3) NOT NULL,
  "endAt" TIMESTAMPTZ(3) NOT NULL,
  "status" "public"."ReservationStatus"
    NOT NULL DEFAULT 'CONFIRMED',
  "cancelledAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3)
    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "reservations_pkey"
    PRIMARY KEY ("id"),

  CONSTRAINT "reservations_time_check"
    CHECK ("startAt" < "endAt"),

  CONSTRAINT "reservations_cancellation_check"
    CHECK (
      ("status" = 'CONFIRMED' AND "cancelledAt" IS NULL)
      OR
      ("status" = 'CANCELLED' AND "cancelledAt" IS NOT NULL)
    ),

  CONSTRAINT "reservations_userId_fkey"
    FOREIGN KEY ("userId")
    REFERENCES "public"."users" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,

  CONSTRAINT "reservations_classroomId_fkey"
    FOREIGN KEY ("classroomId")
    REFERENCES "public"."classrooms" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "reservations_classroomId_status_startAt_idx"
  ON "public"."reservations"
  ("classroomId", "status", "startAt");

CREATE INDEX "reservations_userId_startAt_idx"
  ON "public"."reservations" ("userId", "startAt");

ALTER TABLE "public"."reservations"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."reservations"
  FROM anon, authenticated;

COMMIT;
