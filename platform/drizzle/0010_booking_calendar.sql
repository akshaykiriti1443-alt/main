CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"calendar_id" uuid NOT NULL,
	"contact_id" uuid,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"blocked_until" timestamp with time zone NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"status" text DEFAULT 'confirmed' NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"email" text NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"answers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"manage_token_hash" text NOT NULL,
	"manage_token_enc" text NOT NULL,
	"ics_sequence" integer DEFAULT 0 NOT NULL,
	"cancel_reason" text DEFAULT '' NOT NULL,
	"cancelled_at" timestamp with time zone,
	"rescheduled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_manage_token_hash_unique" UNIQUE("manage_token_hash")
);
--> statement-breakpoint
CREATE TABLE "calendars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"duration_minutes" integer DEFAULT 30 NOT NULL,
	"buffer_minutes" integer DEFAULT 0 NOT NULL,
	"slot_interval_minutes" integer DEFAULT 0 NOT NULL,
	"min_notice_minutes" integer DEFAULT 240 NOT NULL,
	"max_days_ahead" integer DEFAULT 30 NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"availability" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"location_type" text DEFAULT 'zoom' NOT NULL,
	"location_value" text DEFAULT '' NOT NULL,
	"phone_mode" text DEFAULT 'optional' NOT NULL,
	"questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"confirmation_message" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_messages" ADD COLUMN "attachments" jsonb;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_calendar_id_calendars_id_fk" FOREIGN KEY ("calendar_id") REFERENCES "public"."calendars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendars" ADD CONSTRAINT "calendars_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bookings_calendar_start_idx" ON "bookings" USING btree ("calendar_id","start_at");--> statement-breakpoint
CREATE INDEX "bookings_workspace_start_idx" ON "bookings" USING btree ("workspace_id","start_at");--> statement-breakpoint
CREATE INDEX "bookings_contact_idx" ON "bookings" USING btree ("contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_active_start_uq" ON "bookings" USING btree ("calendar_id","start_at") WHERE "bookings"."status" in ('confirmed', 'rescheduled');--> statement-breakpoint
CREATE UNIQUE INDEX "calendars_workspace_slug_uq" ON "calendars" USING btree ("workspace_id","slug");--> statement-breakpoint
-- No double bookings, enforced by the database: two active bookings on one calendar can't overlap
-- (each blocks [start, end + buffer)). Needs btree_gist (Supabase, Neon, RDS and PGlite have it);
-- where it can't be installed, the unique start index above plus the app's row lock still apply.
DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS btree_gist;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'btree_gist unavailable: bookings rely on bookings_active_start_uq and row locks';
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'btree_gist') THEN
    ALTER TABLE "bookings" ADD CONSTRAINT "bookings_no_overlap" EXCLUDE USING gist ("calendar_id" WITH =, tstzrange("start_at", "blocked_until", '[)') WITH &&) WHERE ("status" IN ('confirmed', 'rescheduled'));
  END IF;
END $$;
