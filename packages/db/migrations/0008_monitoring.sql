CREATE TABLE "error_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"context" text NOT NULL,
	"message" text NOT NULL,
	"detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone NOT NULL,
	"ok" boolean NOT NULL,
	"summary" jsonb,
	"error" text
);
--> statement-breakpoint
CREATE INDEX "error_log_created_idx" ON "error_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "job_runs_job_started_idx" ON "job_runs" USING btree ("job","started_at");