BEGIN;

CREATE TABLE "public"."classrooms" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "location" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "classrooms_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."classroom_operating_hours" (
  "id" UUID NOT NULL,
  "classroomId" UUID NOT NULL,
  "weekday" INTEGER NOT NULL,
  "startMinute" INTEGER NOT NULL,
  "endMinute" INTEGER NOT NULL,
  CONSTRAINT "classroom_operating_hours_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "operating_hours_weekday_check"
    CHECK ("weekday" BETWEEN 0 AND 6),
  CONSTRAINT "operating_hours_time_check"
    CHECK (
      "startMinute" >= 0
      AND "endMinute" <= 1440
      AND "startMinute" < "endMinute"
    )
);

CREATE UNIQUE INDEX
  "classroom_operating_hours_classroomId_weekday_key"
  ON "public"."classroom_operating_hours" ("classroomId", "weekday");

ALTER TABLE "public"."classroom_operating_hours"
  ADD CONSTRAINT "classroom_operating_hours_classroomId_fkey"
  FOREIGN KEY ("classroomId")
  REFERENCES "public"."classrooms" ("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."classrooms" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."classroom_operating_hours"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  "public"."classrooms", "public"."classroom_operating_hours"
  FROM anon, authenticated;

COMMIT;
