-- 140_remove_retired_workflow_module.sql
-- Removes database objects and registry data that belonged exclusively to the retired workflow module.

DELETE FROM role_permissions
WHERE permission_id IN (
  SELECT id FROM permissions WHERE module = 'automation.rules'
);

DELETE FROM permissions
WHERE module = 'automation.rules';

DELETE FROM saas_modules
WHERE slug = 'automation';

UPDATE notifications
SET action_url = replace(action_url, '/dashboard/automation', '/dashboard/notifications')
WHERE action_url LIKE '/dashboard/automation%';

DROP TABLE IF EXISTS automation_logs;
DROP TABLE IF EXISTS automation_rules;
DROP TABLE IF EXISTS scheduled_tasks;
