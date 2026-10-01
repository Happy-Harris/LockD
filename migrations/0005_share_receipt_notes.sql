-- Web readiness gap 2: a session receipt share carried the workout's private notes in its payload, although no
-- receipt ever showed them. New shares no longer include them (src/lib/cloud/shares.ts) and reads drop them; this
-- removes them from receipts already published. Nothing else in a share changes.
update lockd_shares set payload = payload - 'notes' where kind = 'receipt' and payload ? 'notes';
