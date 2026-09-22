/**
 * True when an If-None-Match header names `etag` (or is "*"). Compared by
 * hand because Express's req.fresh treats any request carrying
 * "Cache-Control: no-cache" as unconditional, and browsers add exactly that
 * header to fetch(..., { cache: 'no-store' }), which the seat poller uses so
 * its own If-None-Match reaches the server.
 */
export function etagMatches(ifNoneMatch: string | undefined, etag: string): boolean {
  if (!ifNoneMatch) {
    return false;
  }
  const opaque = (tag: string) => tag.trim().replace(/^W\//, '');
  return ifNoneMatch
    .split(',')
    .map((tag) => tag.trim())
    .some((tag) => tag === '*' || opaque(tag) === opaque(etag));
}
