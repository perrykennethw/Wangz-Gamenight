# GCP deployment recommendation for Wangz Game Night

Research date: 2026-08-16. External claims below use only official Google Cloud documentation.

## Executive recommendation

Deploy the application as **one public Cloud Run service** that serves both the built Vite frontend and the Node/Socket.IO endpoint from the same HTTP server and origin.

Cloud Run is the best fit because this is a small containerizable web application, not a Kubernetes platform or a VM-dependent workload. Google's current compute decision guide says to use Cloud Run when Google should manage the infrastructure, and its Cloud Run/GKE architecture guide recommends considering serverless first unless Kubernetes is specifically needed ([choose compute options](https://cloud.google.com/docs/compute-area/choose-compute-options), [select a managed container runtime](https://cloud.google.com/architecture/select-managed-container-runtime-environment)).

The important qualifier is application state. All rooms, connections, participants, and chat messages currently live in process-local `Map` objects in `server/index.ts`; the README also says they disappear when the server restarts. A player must therefore reach the exact process that created the room. Run **exactly one serving instance at first**, then externalize room state before enabling horizontal scaling.

The recommended evolution is:

1. **Initial release:** one manually scaled Cloud Run instance, one container, same-origin frontend and Socket.IO, with ephemeral sessions accepted as an explicit product limitation.
2. **Scalable release:** Cloud Run autoscaling plus Memorystore for Redis for cross-instance Socket.IO synchronization and shared ephemeral room state; optionally add Firestore for durable history.

## Repository-specific deployment work required

The repository is close to Cloud Run-compatible, but it is not yet a production artifact.

- `src/roomClient.ts` uses same-origin Socket.IO, which is ideal for one Cloud Run origin.
- `server/index.ts` honors the injected `PORT` environment variable. Cloud Run requires the ingress container to listen on `0.0.0.0` on that port ([container runtime contract](https://cloud.google.com/run/docs/container-contract)). Make the host binding explicit rather than relying on Node's default behavior.
- The Node server currently serves only `/health`; every other HTTP path returns 404. It must serve the Vite `dist/` directory and return the SPA entry point for frontend routes.
- A production build must run `npm run build`, then start the Socket.IO/static-file server. There is no production `start` script, and `tsx` is currently a development dependency. Either compile the server to JavaScript or deliberately include a supported production runtime. Google's Node buildpack uses the package build and start scripts, but an explicit multi-stage Dockerfile will make this mixed Vite/server artifact more predictable ([Node.js buildpacks](https://cloud.google.com/docs/buildpacks/nodejs)).
- The existing `/health` route is suitable for a Cloud Run health probe. Cloud Run supports configurable startup and liveness probes ([health checks](https://cloud.google.com/run/docs/configuring/healthchecks)).

Do not split the frontend into Cloud Storage/Firebase Hosting and the backend into a separate Cloud Run service for the first release. That introduces another origin, Socket.IO URL configuration, CORS, and edge-routing behavior without solving the in-memory state problem.

## Initial Cloud Run configuration

| Setting | Recommendation | Reason |
|---|---|---|
| Service access | Public | Browsers and players are unauthenticated Cloud Run callers. Cloud Run supports public access by disabling the invoker IAM check ([public access](https://cloud.google.com/run/docs/authenticating/public)). |
| Region | One region near the expected players | Keeps interactive latency low; place future Redis/Firestore resources compatibly. |
| Scaling | Manual scaling, `1` instance | Cloud Run manual scaling sets a specific service instance count ([manual scaling](https://cloud.google.com/run/docs/configuring/services/manual-scaling)). It avoids normal autoscaling across multiple isolated in-memory room maps. |
| Request timeout | `3600s` | Cloud Run WebSockets are subject to the service request timeout, which is configurable up to 60 minutes ([request timeout](https://cloud.google.com/run/docs/configuring/request-timeout), [WebSockets](https://cloud.google.com/run/docs/triggering/websockets)). |
| Concurrency | Start around `200`; load-test | A full room can use 21 sockets. Cloud Run supports up to 1,000 concurrent connections per container and recommends higher concurrency for WebSocket services when the app can handle it ([WebSockets](https://cloud.google.com/run/docs/triggering/websockets)). |
| Session affinity | Enable as a reconnect aid only | It is best effort and cannot make process-local state safe across instances ([session affinity](https://cloud.google.com/run/docs/configuring/session-affinity), [WebSockets](https://cloud.google.com/run/docs/triggering/websockets)). |
| CPU/memory | Begin with 1 vCPU / 512 MiB, then measure | This app has a small Node/React footprint; Monitoring should drive adjustment. |
| Health | `/health` startup/liveness probe | The route already exists and returns JSON success. |
| Service identity | Dedicated user-managed service account with no roles initially | The current service calls no Google APIs. Google recommends a user-managed identity with only the minimum permissions required ([service identity](https://cloud.google.com/run/docs/securing/service-identity)). |

A representative deployment after producing the container image is:

```bash
gcloud run deploy wangz-gamenight \
  --image REGION-docker.pkg.dev/PROJECT_ID/REPOSITORY/wangz-gamenight:TAG \
  --region REGION \
  --port 8080 \
  --timeout 3600 \
  --concurrency 200 \
  --scaling 1 \
  --session-affinity \
  --no-invoker-iam-check \
  --service-account wangz-gamenight@PROJECT_ID.iam.gserviceaccount.com
```

These flags are available on the current `gcloud run deploy` command ([CLI reference](https://cloud.google.com/sdk/gcloud/reference/run/deploy)). Use placeholders appropriate to the project and selected region.

### Lower-cost hobby alternative

Automatic scaling with `min-instances=0` and `max-instances=1` can scale to zero when unused, but it is not a strict single-process guarantee. Google documents that a configured maximum can be exceeded briefly during traffic spikes, maintenance, and deployments ([maximum instances](https://cloud.google.com/run/docs/configuring/max-instances), [autoscaling behavior](https://cloud.google.com/run/docs/about-instance-autoscaling)). Use this cheaper mode only if an occasional failed join or lost room during replacement is acceptable. The stronger initial correctness choice is manual scaling to one instance.

Even manual scaling does not make memory durable. Instance replacement, process failure, or deployment still removes every room. Avoid deploying during active games until state recovery exists.

## Critical WebSocket limitation to fix

Cloud Run supports WebSockets without extra protocol configuration, but each WebSocket remains an HTTP request. The default request timeout is five minutes and the maximum is 60 minutes. Clients must reconnect, and a reconnect is not guaranteed to reach the same instance ([Cloud Run WebSocket guidance](https://cloud.google.com/run/docs/triggering/websockets)).

Socket.IO can reconnect its transport, but the current server treats every disconnect as a permanent leave. A host disconnect immediately closes the room; a player disconnect deletes that participant. Therefore a Cloud Run timeout or brief network interruption can end the game even when the browser reconnects successfully.

Before relying on long sessions, add:

- stable participant/host resume tokens that are not socket IDs;
- a reconnect grace period before deleting a participant or closing a room;
- idempotent room reattachment and state resynchronization;
- client handling for a resumed session and for an unrecoverable expired room.

Open WebSockets also keep the instance active: Google states that an instance with any open WebSocket is considered active, receives CPU, and is billed accordingly ([WebSocket billing](https://cloud.google.com/run/docs/triggering/websockets)). Manual scaling also incurs idle-instance charges when no game is active ([manual-scaling billing](https://cloud.google.com/run/docs/configuring/services/manual-scaling), [Cloud Run pricing](https://cloud.google.com/run/pricing)).

## Scaling beyond one instance

Do not increase the instance count until authoritative state and event propagation are external to the process. Session affinity is per client and best effort; it cannot ensure that a new player reaches the instance holding a particular room.

Google's official multi-room WebSocket tutorial uses Memorystore for Redis and Redis Pub/Sub to synchronize clients connected to different Cloud Run instances. It explicitly recommends Direct VPC egress and recommends Standard Tier Redis when high availability matters ([WebSocket chat architecture](https://cloud.google.com/run/docs/tutorials/websockets)). Socket.IO also has a Redis adapter for this broadcast layer.

For this application, the production-scale data path should be:

- **Memorystore for Redis:** room membership, short-lived game state, chat cache, presence/leases, and cross-instance Socket.IO event propagation.
- **Direct VPC egress:** private connectivity from Cloud Run to Redis. Google recommends Direct VPC egress over a Serverless VPC Access connector because it is simpler, lower latency, higher throughput, and scales network cost with the service ([Direct VPC comparison](https://cloud.google.com/run/docs/configuring/connecting-vpc), [Cloud Run to Memorystore](https://cloud.google.com/memorystore/docs/redis/connect-redis-instance-cloud-run)).
- **Firestore, only if durability is required:** completed games, resumable rooms, or long-term chat/game history. Google's WebSocket tutorial distinguishes Redis synchronization from indefinite history and cites Firestore as a durable option ([WebSocket tutorial limitations](https://cloud.google.com/run/docs/tutorials/websockets)).
- **Cloud SQL, only for relational features:** accounts, leagues, billing, or reporting with relational constraints. It is unnecessary for the current ephemeral game model. If adopted, use connection pooling; Cloud Run instances can each open many database connections and total connections grow with scale ([Cloud SQL from Cloud Run](https://cloud.google.com/sql/docs/mysql/connect-run)).
- **Cloud Storage, only for persistent files:** future uploaded images, audio, exports, or user content. The ordinary Cloud Run container filesystem is disposable and does not persist when an instance stops ([Cloud Run overview](https://cloud.google.com/run/docs/overview/what-is-cloud-run)). Static application assets can remain in the container image.

No database, VPC, or Secret Manager resource is required for the current code if its intentionally ephemeral semantics and single instance are accepted.

## Networking, domains, and secrets

- The initial public `run.app` endpoint includes managed HTTPS; no custom load balancer is required for a private game-night MVP.
- For a production custom domain, Google recommends a global external Application Load Balancer. It also enables Cloud CDN and Cloud Armor. Direct Cloud Run domain mapping remains Preview and is explicitly not recommended for production ([custom domains](https://cloud.google.com/run/docs/mapping-custom-domains)). Cloud Run WebSockets are supported through Cloud Load Balancing ([WebSockets](https://cloud.google.com/run/docs/triggering/websockets)).
- No VPC is needed until the service accesses a private resource such as Memorystore. At that point, use Direct VPC egress and keep Redis private.
- There are no application secrets today. Put future API keys, passwords, and certificates in Secret Manager, mounted as files or exposed as pinned-version environment variables. Google recommends Secret Manager for sensitive Cloud Run configuration ([configure secrets](https://cloud.google.com/run/docs/configuring/services/secrets)).
- Use the Cloud Run service identity and Application Default Credentials for Google APIs; do not ship a service-account key or set `GOOGLE_APPLICATION_CREDENTIALS` in Cloud Run ([service identity](https://cloud.google.com/run/docs/securing/service-identity)).

Because the service must be publicly callable, the five-character room code is an application convenience rather than strong authentication. Rate limiting, host authorization/resume tokens, input validation, and abuse controls remain application responsibilities. If internet exposure grows, the recommended load balancer path permits Cloud Armor.

## Build, release, and operations

- Build a versioned container image, store it in Artifact Registry, and deploy it to Cloud Run. Cloud Build can build, push, and deploy the image, and repository triggers can automate deployment from Git ([Cloud Build deployment](https://cloud.google.com/build/docs/deploying-builds/deploy-cloud-run), [continuous deployment](https://cloud.google.com/run/docs/continuous-deployment)).
- Run `npm run typecheck`, `npm run build`, and `npm run test:privacy` before publishing an image. Run the privacy test against the built container in CI as well.
- Treat deploys as session-destructive while rooms are in memory. Use a staging service and schedule production changes outside game windows. Once state is externalized, use revision rollouts and rollback support.
- Cloud Run automatically sends request, container, and system logs to Cloud Logging. Exceptions on stdout/stderr can appear in Error Reporting, and Cloud Monitoring records service metrics ([monitoring and logging](https://cloud.google.com/run/docs/monitoring-overview), [logging](https://cloud.google.com/run/docs/logging)).
- Emit structured logs for room creation/closure, reconnect attempts, failed joins, active socket count, and room count, but never log private team-chat contents or resume credentials.
- Create alerts for 5xx/429 responses, container restarts, instance count above the intended topology, reconnect spikes, health failures, latency, and billable instance time. Add a billing budget because persistent WebSockets are active compute.

## Why not the alternatives?

| Platform | Assessment for this application |
|---|---|
| **Cloud Run** | Best current fit: managed containers, HTTPS and WebSockets, little infrastructure, source/image deployment, and a clean path from one instance to Redis-backed autoscaling. Its 60-minute WebSocket timeout and stateless-instance model must be handled explicitly. |
| **App Engine** | Not preferred for a new application. Google recommends evaluating Cloud Run as the preferred App Engine alternative for new users. WebSockets require App Engine Flexible, where connections also time out after one hour, affinity is best effort, and instances are periodically restarted ([Cloud Run vs App Engine](https://cloud.google.com/appengine/migration-center/run/compare-gae-with-run), [App Engine WebSockets](https://cloud.google.com/appengine/docs/flexible/using-websockets-and-session-affinity)). It offers no material advantage here. |
| **GKE Autopilot** | Appropriate when Kubernetes primitives, complex service networking, policy control, or long-lived/stateful workloads justify a cluster. Google recommends Cloud Run first when a workload fits serverless and lower operational overhead is desired ([managed runtime selection](https://cloud.google.com/architecture/select-managed-container-runtime-environment), [GKE and Cloud Run](https://cloud.google.com/kubernetes-engine/docs/concepts/gke-and-cloud-run)). GKE still does not make process-local room state safe across replicas. |
| **Compute Engine** | A single VM can keep the current single-process routing model without Cloud Run's 60-minute request limit, but the team must manage the VM, OS, patches, networking, deployments, availability, and scaling. Google positions Compute Engine for workloads needing VM/kernel control and notes that orchestration is manual ([choose compute options](https://cloud.google.com/docs/compute-area/choose-compute-options)). The VM or process remains a single failure domain and rooms still disappear on restart. |

## Bottom line

The best GCP architecture is **one same-origin Cloud Run service now, with manual scaling to one instance**, after adding a production static/server entrypoint and basic reconnection support. This is intentionally a low-scale, ephemeral mode.

When the application needs horizontal scale or fewer room-loss failure modes, keep Cloud Run but move live room state and Socket.IO fan-out to **Memorystore for Redis over Direct VPC egress**, with Firestore only for data that must outlive a game. GKE, App Engine, and Compute Engine add operational cost without removing the application's current state-management constraint.
