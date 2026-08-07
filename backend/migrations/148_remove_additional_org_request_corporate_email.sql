-- Remove the retired corporateEmail field from stored additional organization request JSON.
UPDATE organization_change_requests
SET changes = jsonb_set(
  changes::jsonb,
  '{additionalOrganization,new}',
  (changes::jsonb #> '{additionalOrganization,new}') - 'corporateEmail'
)::jsonb,
updated_at = now()
WHERE changes::jsonb ? 'additionalOrganization'
  AND ((changes::jsonb #> '{additionalOrganization,new}') ? 'corporateEmail');
