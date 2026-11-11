# Sessions own identity; operations consume snapshots

Polymind remains one Node process with local modules. Its event store owns guest identity, authored revisions, round closure and immutable snapshots. Analysis, bounded voice and the packaged Match worker consume snapshots without starting the continuous composer. Completion and publication are separate mutations.

The existing append-only microphone journals retain one writer and frozen model configuration. A session can have several rounds and voice runs; ending a run does not end the event. One continuous stream is active per process. SQLite and journal locks require one application replica and a durable volume.

Match remains an independently maintained Python package, installed from a reviewed, hashed wheel. Puck, Flight and the hub remain independent applications. There is no shared sign-in or service broker.
