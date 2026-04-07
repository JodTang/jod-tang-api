CREATE TYPE "category_type" AS ENUM('expense', 'income', 'both');--> statement-breakpoint
CREATE TYPE "transaction_source" AS ENUM('web', 'line');--> statement-breakpoint
CREATE TYPE "transaction_type" AS ENUM('expense', 'income');--> statement-breakpoint
CREATE TYPE "user_status" AS ENUM('pending', 'active', 'banned');--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"icon" varchar,
	"type" "category_type" NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invite_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"code" varchar(255) NOT NULL UNIQUE,
	"max_uses" integer DEFAULT 1 NOT NULL,
	"used_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp(3),
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"category_id" uuid,
	"type" "transaction_type" NOT NULL,
	"amount" numeric(12,2) NOT NULL,
	"note" text,
	"transacted_at" date NOT NULL,
	"source" "transaction_source",
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"line_user_id" varchar(255) NOT NULL UNIQUE,
	"invite_code_id" uuid,
	"display_name" varchar NOT NULL,
	"status" "user_status" DEFAULT 'pending'::"user_status" NOT NULL,
	"activated_at" timestamp(3),
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "categories_user_id_idx" ON "categories" ("user_id");--> statement-breakpoint
CREATE INDEX "categories_type_idx" ON "categories" ("type");--> statement-breakpoint
CREATE INDEX "invite_codes_code_idx" ON "invite_codes" ("code");--> statement-breakpoint
CREATE INDEX "transactions_user_date_idx" ON "transactions" ("user_id","transacted_at");--> statement-breakpoint
CREATE INDEX "transactions_user_category_idx" ON "transactions" ("user_id","category_id");--> statement-breakpoint
CREATE INDEX "transactions_user_type_date_idx" ON "transactions" ("user_id","type","transacted_at");--> statement-breakpoint
CREATE INDEX "users_line_user_id_idx" ON "users" ("line_user_id");--> statement-breakpoint
CREATE INDEX "users_invite_code_id_idx" ON "users" ("invite_code_id");--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_categories_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_invite_code_id_invite_codes_id_fkey" FOREIGN KEY ("invite_code_id") REFERENCES "invite_codes"("id") ON DELETE SET NULL;