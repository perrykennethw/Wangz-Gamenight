# Keep the presenter local to the host

The presenter display is a same-origin tab that receives an audience-safe projection from the host tab through `BroadcastChannel`, rather than a separately authenticated server connection. This avoids a new public viewer role and keeps hidden room state out of the presenter, at the cost of requiring the presenter and host tabs to remain open on the same device.
