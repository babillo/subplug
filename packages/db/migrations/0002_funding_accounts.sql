CREATE TABLE "funding_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"gateway" text NOT NULL,
	"account_reference" text NOT NULL,
	"bank_code" text NOT NULL,
	"bank_name" text NOT NULL,
	"account_number" text NOT NULL,
	"account_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "funding_accounts_gateway_bank_account_unique" UNIQUE("gateway","bank_code","account_number")
);
--> statement-breakpoint
ALTER TABLE "funding_accounts" ADD CONSTRAINT "funding_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "funding_accounts_reference_idx" ON "funding_accounts" USING btree ("gateway","account_reference");--> statement-breakpoint
CREATE INDEX "funding_accounts_user_idx" ON "funding_accounts" USING btree ("user_id");