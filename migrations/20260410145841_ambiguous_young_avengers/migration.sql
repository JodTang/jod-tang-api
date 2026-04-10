CREATE TABLE "app_settings" (
	"key" varchar(255) PRIMARY KEY,
	"value" text NOT NULL,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "app_settings_key_idx" ON "app_settings" ("key");