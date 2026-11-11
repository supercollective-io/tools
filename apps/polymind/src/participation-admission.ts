import type { LiveController } from "./live.ts";
import type { ParticipationStore } from "./participation-store.ts";

/** New revisions saved during this finite snapshot remain pending for the next tick. */
export async function admitPending(
  store: ParticipationStore,
  controller: LiveController,
) {
  const batch = store.batch();
  if (!batch.length) return;
  const admitted = new Set(
    await controller.admitInputs(
      batch.map((item) => ({
        id: item.id,
        participantId: item.participant,
        text: item.text,
        replace: item.revision !== undefined,
      })),
    ),
  );
  // A crash before acknowledgement safely replays the same IDs. A partial
  // journal failure leaves the snapshot queued for recovery, never acknowledged.
  for (const item of batch) {
    if (admitted.has(item.id))
      store.admitted(item.id, item.position, item.revision, item.participant);
  }
}
