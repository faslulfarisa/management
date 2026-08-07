-- 088_fix_subscription_plan_branch_limits.sql
-- 084 set max_active_branches using `slug ILIKE 'starter'` / 'professional',
-- but the actual seeded slugs are 'starter-plan' / 'professional-plan' /
-- 'enterprise-plan', so none of those updates matched and every plan was
-- left at max_active_branches = NULL (unlimited). Fix the slug match so
-- the tiered limits (Starter=3, Professional=10, Enterprise=unlimited)
-- actually apply.

UPDATE subscription_plans SET max_active_branches = 3  WHERE slug = 'starter-plan'      AND max_active_branches IS NULL;
UPDATE subscription_plans SET max_active_branches = 10 WHERE slug = 'professional-plan' AND max_active_branches IS NULL;
-- 'enterprise-plan' intentionally left NULL (unlimited).
