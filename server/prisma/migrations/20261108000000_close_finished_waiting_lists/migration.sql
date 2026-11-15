-- Waiting-list entries were left open when a resale was completed, which kept
-- those employees from registering for later resales. Close the ones left
-- behind by resales that have already finished (new completions do this in
-- routes/resales.ts).
UPDATE "Registration"
SET "status" = 'NOT_SELECTED', "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" = 'WAITING_LIST'
  AND "resaleId" IN (SELECT "id" FROM "Resale" WHERE "status" IN ('COMPLETED', 'ARCHIVED'));
