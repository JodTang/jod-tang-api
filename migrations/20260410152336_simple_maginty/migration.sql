CREATE TYPE "user_role" AS ENUM('user', 'admin', 'owner');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" "user_role" DEFAULT 'user'::"user_role" NOT NULL;