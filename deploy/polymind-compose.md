# Polymind as a Git-backed Coolify Compose Application

Use [compose.polymind.yaml](../compose.polymind.yaml) when deployment requirements should live in Git. It runs one Polymind service, built with the existing Dockerfile, and declares its dedicated named volume at `/data`. It includes Match in the same image. Puck, Hub, Flight and Hyperchat keep their existing independent deployments.

This definition is specifically for **OpenAI-enabled analysis and similarity matching**. It requires `OPENAI_API_KEY`, `OPERATOR_TOKEN` and `PUBLIC_ORIGIN` at Compose interpolation time. Empty or missing values fail before container creation. It does not validate the provider credential, account quota or selected model; the operator still chooses a model and budget for each operation. An Ollama-only installation should use its own reviewed deployment definition instead of supplying a dummy OpenAI key.

## Why this is a deployment setting

The Dockerfile builds an image and creates a writable `/data` directory. `DATA_DIR=/data/polymind` selects where the app writes; neither creates durable deployment storage. A Dockerfile `VOLUME /data` would not identify a stable named volume: anonymous volumes are not automatically reused by subsequent containers. See [Docker's volume lifecycle](https://docs.docker.com/engine/storage/volumes/).

Both Coolify workflows are valid:

| Workflow | Storage source of truth | Missing credentials |
| --- | --- | --- |
| Existing Dockerfile Application | Add a dedicated Volume Mount at `/data` in Persistent Storage | Operator/runtime checks; importing an environment template does not enforce all feature prerequisites |
| This Git-backed Compose Application | `polymind-data:/data` in the committed Compose definition | `${VARIABLE:?message}` rejects absent/empty required values before deployment |

Prefer the existing application's manual mount for an urgent repair. Use Compose for reproducible new installations and a deliberate transition of the existing installation. No change to this file automatically converts a Dockerfile Application. [Coolify storage](https://coolify.io/docs/applications/configuration/persistent-storage) and [Compose configuration](https://coolify.io/docs/applications/builds/docker-compose) describe the two sources of truth.

## Configure a new application

1. Select a Git-backed **Application**, using the Tools repository and a reviewed branch/commit containing this file. Do not use Docker Compose Empty, which creates a separate Service with a different source of truth.
2. Select the Compose build strategy. Set Base Directory to `/` and Docker Compose Location to `/compose.polymind.yaml`. Both the Compose file and its build context are at the repository root.
3. Load the definition. Keep normal Coolify-managed Compose mode; do not enable raw mode.
4. Set these variables privately, available in the container and unavailable during build:

   | Variable | Value |
   | --- | --- |
   | `PUBLIC_ORIGIN` | Canonical HTTPS origin, for example `https://polymind.supercollective.io`, without a path or internal port |
   | `OPERATOR_TOKEN` | Existing private token, at least 32 characters; preserve it when moving an application |
   | `OPENAI_API_KEY` | Existing provider key with access to the models the operator will select |
   | `HUB_URL` | Defaults to `https://we.supercollective.io`; change only when using a different hub |
   | `TRANSCRIPTION_MODEL` | Optional explicit model; blank leaves recording/transcription unavailable |
   | `JEV_API_KEY` | Optional, required only if selecting the collaboration matching provider |

5. Add the public domain to the `polymind` service, with internal port `3000`, for example `https://polymind.supercollective.io:3000`. Its public origin must match `PUBLIC_ORIGIN`. No host `ports:` mapping or custom proxy labels are needed. This definition uses an explicit origin so an existing deployment can preserve its current value; it does not depend on wildcard-generated domains.
6. Inspect Persistent Storage after parsing. Confirm the managed named volume has destination `/data`. Compose-owned fields are edited in Git, not in the storage dashboard. Keep the resource/service/volume identities stable across redeployments; do not attach a preview to production storage.
7. Retain one replica and stop the previous writer before replacement. Use the image's existing native health check. Do not configure a second HTTP probe requiring curl or wget.
8. Deploy only when the target and any existing data transition below have been reviewed. Verify the running container uses UID/GID `10001:10001` and can write `/data/polymind`.

## Transition an existing Dockerfile Application

Adding a new mount can hide data in the old container. Changing resource or build strategy can also select a different volume. Do not assume either operation migrates existing sessions.

1. Record the current resource, image/revision, runtime variable names and effective data path. Keep secret values in the existing private configuration.
2. Inspect the actual container mounts and the old data location. If data matters, stop its writer and make a consistent [backup](../docs/ops-backup.md) before changing storage. A new volume does not recover data from an already removed container.
3. Decide how to preserve the data. For a new Compose resource, restore the verified backup into its dedicated volume while both application writers are stopped. Review an explicitly named external-volume override separately if deliberately reusing an existing volume; do not guess Coolify's managed name or share it between concurrent writers.
4. Set the preserved operator token and reviewed provider configuration on the chosen resource. Do not bulk-replace unrelated production settings.
5. Inspect the parsed Compose configuration and its actual volume source before admitting participants. Check ownership `10001:10001` for Polymind; Puck and Hub use different ownership and separate volumes.
6. Replace the old writer, switch routing if using a new resource, and complete the persistence check below. Retain the old backup/volume until restoration and rollback have been verified.

## Verify persistence and provider readiness

1. Record the effective mount's stable source/name and `/data` destination from Coolify or container inspection. A writable directory or a successful `/healthz` response does not prove persistence across replacement.
2. Create a disposable session, join as a synthetic participant and save a short contribution. Retain its participant link and recovery code privately.
3. Redeploy the same resource without changing the volume identity. This deliberately replaces the container; a page reload alone is not the test.
4. Open the same session and recover the same participant. Confirm the saved text remains. If it is missing, stop further rehearsals and correct the effective mount.
5. With an explicit provider budget, run one short analysis and one similarity matching job. Review the outputs privately. The existence of a key does not prove that provider calls work.
6. Record the result and the exact deployed revision/image. Rehearse isolated backup restoration separately; a volume is not a backup.

## Local checks without providers

Use synthetic values and an empty environment file. Do not print a rendered production Compose configuration: it contains interpolated secrets.

```sh
PUBLIC_ORIGIN=https://rehearsal.invalid \
OPERATOR_TOKEN=synthetic-operator-token-for-local-checks-only \
OPENAI_API_KEY=synthetic-not-a-provider-key \
docker compose --env-file /dev/null -f compose.polymind.yaml config --quiet
```

Unset or blank `OPENAI_API_KEY`, `OPERATOR_TOKEN` or `PUBLIC_ORIGIN` must make the configuration check fail and name the missing setting. These are presence checks only. Do not call providers with the synthetic values.

Use the root container recipes for the unchanged image. A local Compose parse does not prove that the chosen Coolify version parsed required fields, attached the intended volume, preserved its name or passed the deployed write–redeploy–read check.
