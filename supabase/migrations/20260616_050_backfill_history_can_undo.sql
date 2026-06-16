-- Backfill can_undo for historical activity events
-- Safe target: only events that are not already undone and currently non-undoable.
-- Includes inventory events only. Settings updates stay non-undoable because their
-- historical metadata must not store sensitive profile snapshots.

update activity_events
set can_undo = true
where coalesce(can_undo, false) = false
  and undone_at is null
  and (
    type::text in ('product_added', 'product_consumed', 'product_wasted')
    or (type::text = 'product_adjusted' and coalesce(metadata->>'section', '') <> 'settings')
  );
