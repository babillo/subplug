ALTER TABLE "orders" ADD COLUMN "client_reference" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "provider_message" text;--> statement-breakpoint
CREATE UNIQUE INDEX "orders_user_client_reference_unique" ON "orders" USING btree ("user_id","client_reference") WHERE "orders"."client_reference" is not null;--> statement-breakpoint
CREATE INDEX "orders_recipient_created_idx" ON "orders" USING btree ("recipient_phone","created_at");