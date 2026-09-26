import { useEffect, useState } from "react";

// Pages without a service worker (booking, tools) have no way to notice a new
// deploy landed while they sat open - checks the page's own ETag periodically
// and on refocus, and lets the caller decide how to react (banner vs reload).
export function useNewVersionAvailable(path) {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    let baseline = null;
    async function check() {
      try {
        const response = await fetch(path, { cache: "no-store" });
        const tag = response.headers.get("etag") || response.headers.get("last-modified");
        if (!tag) return;
        if (baseline === null) baseline = tag;
        else if (tag !== baseline) setAvailable(true);
      } catch {
        // Offline or a transient network blip - not worth surfacing.
      }
    }
    check();
    const id = window.setInterval(check, 120000);
    const onVisible = () => {
      if (!document.hidden) check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [path]);
  return available;
}
