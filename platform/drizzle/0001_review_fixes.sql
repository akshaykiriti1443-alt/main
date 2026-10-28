ALTER TABLE "agencies" ADD COLUMN "app_domain_status" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "email_messages" ADD COLUMN "billed_micros" bigint;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "pause_reason" text;