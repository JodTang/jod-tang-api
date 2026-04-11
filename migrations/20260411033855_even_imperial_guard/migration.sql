CREATE TABLE "local_auth_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL UNIQUE,
	"username" varchar(255) NOT NULL UNIQUE,
	"password_hash" text NOT NULL,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "local_auth_credentials_user_id_idx" ON "local_auth_credentials" ("user_id");--> statement-breakpoint
CREATE INDEX "local_auth_credentials_username_idx" ON "local_auth_credentials" ("username");--> statement-breakpoint
ALTER TABLE "local_auth_credentials" ADD CONSTRAINT "local_auth_credentials_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;