CREATE TYPE "public"."funding_status" AS ENUM('credited', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."ledger_direction" AS ENUM('credit', 'debit');--> statement-breakpoint
CREATE TYPE "public"."ledger_reason" AS ENUM('funding', 'purchase', 'refund', 'admin_credit', 'admin_debit', 'seed');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending', 'success', 'failed');--> statement-breakpoint
CREATE TYPE "public"."product_category" AS ENUM('airtime', 'data');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."user_tier" AS ENUM('regular', 'reseller');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"tier" "user_tier" NOT NULL,
	"price_kobo" bigint,
	"discount_bps" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prices_product_tier_unique" UNIQUE("product_id","tier"),
	CONSTRAINT "prices_exactly_one_kind" CHECK (("prices"."price_kobo" is null) <> ("prices"."discount_bps" is null)),
	CONSTRAINT "prices_price_positive" CHECK ("prices"."price_kobo" is null or "prices"."price_kobo" > 0),
	CONSTRAINT "prices_discount_range" CHECK ("prices"."discount_bps" is null or ("prices"."discount_bps" >= 0 and "prices"."discount_bps" < 10000))
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" "product_category" NOT NULL,
	"network" text NOT NULL,
	"name" text NOT NULL,
	"provider_id" text NOT NULL,
	"provider_service_id" text NOT NULL,
	"provider_variation_code" text,
	"provider_price_kobo" bigint,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_provider_plan_unique" UNIQUE NULLS NOT DISTINCT("provider_id","provider_service_id","provider_variation_code")
);
--> statement-breakpoint
CREATE TABLE "providers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "funding_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_id" uuid NOT NULL,
	"gateway" text NOT NULL,
	"gateway_reference" text NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"status" "funding_status" NOT NULL,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "funding_gateway_reference_unique" UNIQUE("gateway","gateway_reference"),
	CONSTRAINT "funding_amount_positive" CHECK ("funding_events"."amount_kobo" > 0)
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_id" uuid NOT NULL,
	"direction" "ledger_direction" NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"balance_after_kobo" bigint NOT NULL,
	"reason" "ledger_reason" NOT NULL,
	"reference_id" text,
	"description" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_amount_positive" CHECK ("ledger_entries"."amount_kobo" > 0),
	CONSTRAINT "ledger_balance_after_not_negative" CHECK ("ledger_entries"."balance_after_kobo" >= 0)
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"wallet_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"provider_id" text NOT NULL,
	"recipient_phone" text NOT NULL,
	"face_value_kobo" bigint NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"status" "order_status" DEFAULT 'pending' NOT NULL,
	"provider_code" text,
	"provider_reference" text,
	"provider_response" jsonb,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_checked_at" timestamp with time zone,
	"refunded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_requestId_unique" UNIQUE("request_id"),
	CONSTRAINT "orders_amount_positive" CHECK ("orders"."amount_kobo" > 0),
	CONSTRAINT "orders_face_value_positive" CHECK ("orders"."face_value_kobo" > 0)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"email" text,
	"phone" text,
	"tier" "user_tier" DEFAULT 'regular' NOT NULL,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"balance_kobo" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallets_userId_unique" UNIQUE("user_id"),
	CONSTRAINT "wallets_balance_not_negative" CHECK ("wallets"."balance_kobo" >= 0)
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prices" ADD CONSTRAINT "prices_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funding_events" ADD CONSTRAINT "funding_events_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_reason_reference_unique" ON "ledger_entries" USING btree ("reason","reference_id") WHERE "ledger_entries"."reference_id" is not null;--> statement-breakpoint
CREATE INDEX "ledger_wallet_created_idx" ON "ledger_entries" USING btree ("wallet_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_user_created_idx" ON "orders" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_pending_idx" ON "orders" USING btree ("created_at") WHERE "orders"."status" = 'pending';