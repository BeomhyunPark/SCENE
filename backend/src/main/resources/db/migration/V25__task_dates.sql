-- #475. Optional task date range for the operator month calendar. Dates only, no time.
-- A due date alone is a one-day task. A start date needs a due date on or after it.
ALTER TABLE tasks
  ADD COLUMN start_date date,
  ADD COLUMN due_date date,
  ADD CONSTRAINT tasks_date_range CHECK (
    start_date IS NULL OR (due_date IS NOT NULL AND start_date <= due_date));
