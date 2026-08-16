// dsh-glass-theme — host-side half.
// All current functionality lives in the client bundle (lib/client.js), which
// the `dsh.client` manifest declaration loads into the web GUI. This host
// half exists to satisfy the cordis plugin contract: the profile loader
// requires every bundle-patch entry to be a function or an object with an
// `apply` method. A future main-process extension (e.g. wallpaper persisted
// to disk) would register here.
export const name = 'dsh-glass-theme'

export function apply(ctx) {
  // No-op: the browser half carries all behavior. Kept as a standalone
  // function so cordis's loader accepts this entry (a bare object with only
  // `name` is rejected as "invalid plugin").
}
