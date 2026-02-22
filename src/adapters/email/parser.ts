import PostalMime from "postal-mime";

export async function parseForwardedEmail(raw: ForwardableEmailMessage["raw"]) {
  return PostalMime.parse(raw);
}
