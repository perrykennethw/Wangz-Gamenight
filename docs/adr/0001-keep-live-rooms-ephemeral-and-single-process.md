# Keep live rooms ephemeral and single-process

Live room state remains in the Node process and production runs exactly one serving instance, favoring a simple host-led event with no external data infrastructure. This means restarts and deployments end active rooms, and horizontal scaling must wait until room state and Socket.IO fan-out are externalized rather than relying on best-effort session affinity.
