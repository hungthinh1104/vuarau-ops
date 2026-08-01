CREATE TABLE "workspace_membership_roles" (
	"workspace_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"role" "workspace_role" NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"assigned_by" uuid,
	CONSTRAINT "workspace_membership_roles_workspace_id_actor_id_role_pk" PRIMARY KEY("workspace_id","actor_id","role")
);
--> statement-breakpoint
ALTER TABLE "workspace_membership_roles" ADD CONSTRAINT "workspace_membership_roles_assigned_by_actors_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_membership_roles" ADD CONSTRAINT "workspace_membership_roles_membership_fk" FOREIGN KEY ("workspace_id","actor_id") REFERENCES "public"."workspace_memberships"("workspace_id","actor_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workspace_membership_roles_actor_idx" ON "workspace_membership_roles" USING btree ("actor_id");--> statement-breakpoint
INSERT INTO "workspace_membership_roles" (
  "workspace_id",
  "actor_id",
  "role",
  "assigned_at",
  "assigned_by"
)
SELECT
  "workspace_id",
  "actor_id",
  "role",
  "created_at",
  NULL
FROM "workspace_memberships"
ON CONFLICT DO NOTHING;
--> statement-breakpoint
CREATE FUNCTION "enforce_workspace_membership_role_set"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_workspace uuid;
  target_actor uuid;
  stored_primary workspace_role;
  role_count integer;
  owner_count integer;
  expected_primary workspace_role;
BEGIN
  target_workspace := CASE WHEN TG_OP = 'DELETE' THEN OLD.workspace_id ELSE NEW.workspace_id END;
  target_actor := CASE WHEN TG_OP = 'DELETE' THEN OLD.actor_id ELSE NEW.actor_id END;

  SELECT role
  INTO stored_primary
  FROM workspace_memberships
  WHERE workspace_id = target_workspace AND actor_id = target_actor;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT
    count(*)::integer,
    count(*) FILTER (WHERE role = 'owner')::integer,
    (array_agg(role ORDER BY CASE role
      WHEN 'owner' THEN 1
      WHEN 'accountant' THEN 2
      WHEN 'sales' THEN 3
      WHEN 'warehouse' THEN 4
      WHEN 'delivery' THEN 5
    END))[1]
  INTO role_count, owner_count, expected_primary
  FROM workspace_membership_roles
  WHERE workspace_id = target_workspace AND actor_id = target_actor;

  -- Empty remains a temporary legacy/import fallback during the dual-read migration.
  IF role_count = 0 THEN
    RETURN NULL;
  END IF;

  IF owner_count > 0 AND role_count > 1 THEN
    RAISE EXCEPTION 'owner role is exclusive for workspace membership'
      USING ERRCODE = 'check_violation';
  END IF;

  IF stored_primary IS DISTINCT FROM expected_primary THEN
    RAISE EXCEPTION 'workspace membership primary role does not match normalized role set'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "workspace_membership_roles_set_ck"
AFTER INSERT OR UPDATE OR DELETE ON "workspace_membership_roles"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "enforce_workspace_membership_role_set"();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "workspace_memberships_role_projection_ck"
AFTER INSERT OR UPDATE ON "workspace_memberships"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "enforce_workspace_membership_role_set"();
