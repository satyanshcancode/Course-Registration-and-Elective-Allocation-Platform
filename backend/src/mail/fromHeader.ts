/**
 * Building the From header from the two settings that describe the sender.
 *
 * `MAIL_FROM` has always held a whole header — `.env.example` ships
 * `Course Registration <no-reply@university.edu>` and existing `.env` files
 * still carry it — so a value that already names its address is passed through
 * untouched. Wrapping it again would produce
 * `"Name" <Course Registration <no-reply@…>>`, which no server accepts.
 *
 * A supplied name is always quoted. A full stop or a comma in a display name
 * would otherwise break or split the header (RFC 5322 §3.4), and quoting a name
 * that did not need it is invisible to the recipient — so there is one rule
 * rather than a test for which characters are safe.
 */
export function formatFromHeader(from: string, name: string | undefined): string {
  const address = from.trim();
  const display = name?.trim() ?? '';
  if (display === '' || address.includes('<')) {
    return address;
  }
  const quoted = display.replace(/[\\"]/g, '\\$&');
  return `"${quoted}" <${address}>`;
}
