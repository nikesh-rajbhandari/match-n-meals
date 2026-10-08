// The booking form lives on the home page; old /book links get a permanent redirect there.
export const GET = (req) => Response.redirect(new URL('/#book', req.url), 308);
