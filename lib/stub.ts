/**
 * The check scripts set this cookie so every generation route answers with its
 * stub, whatever keys the server holds: their assertions are written against
 * the fixtures, and a check run should never spend provider credit. A cookie
 * rather than a header, because it only travels to the app's own origin (the
 * browser's direct upload to Blob stays untouched) and Safari's WebDriver can
 * set one.
 */
export const STUB_COOKIE = "flow-stub";

export function wantsStub(req: Request): boolean {
  const cookies = req.headers.get("cookie") ?? "";
  return cookies.split(";").some((c) => c.trim() === `${STUB_COOKIE}=1`);
}
