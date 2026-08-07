-- 144_recruitment_communication_workspace.sql
-- Centralized ATS communication workspace.
--
-- This widens the existing candidate_communications log so email, SMS,
-- WhatsApp, phone notes, and internal notes share the same candidate timeline.
-- No new tables or permissions are introduced.

DO $$
DECLARE
  constraint_record RECORD;
BEGIN
  FOR constraint_record IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'candidate_communications'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%channel%'
  LOOP
    EXECUTE format('ALTER TABLE candidate_communications DROP CONSTRAINT %I', constraint_record.conname);
  END LOOP;

  FOR constraint_record IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'candidate_communications'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE candidate_communications DROP CONSTRAINT %I', constraint_record.conname);
  END LOOP;
END $$;

ALTER TABLE candidate_communications
  ADD CONSTRAINT candidate_communications_channel_check
    CHECK (channel IN ('email','sms','whatsapp','phone_note','internal_note')),
  ADD CONSTRAINT candidate_communications_status_check
    CHECK (status IN ('sent','failed','logged'));
