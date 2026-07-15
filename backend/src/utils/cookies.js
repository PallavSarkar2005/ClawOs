const { getEnv } = require("../config/env");

const ACCESS_COOKIE = "accessToken";
const REFRESH_COOKIE = "refreshToken";

function baseCookieOptions(overrides = {}) {
  const env = getEnv();
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAME_SITE,
    path: "/",
    ...overrides,
  };
}

function setAuthCookies(res, { accessToken, refreshToken, rememberMe = true }) {
  const env = getEnv();
  const accessMaxAge = 15 * 60 * 1000;
  const refreshMaxAge = env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;

  res.cookie(ACCESS_COOKIE, accessToken, baseCookieOptions({ maxAge: accessMaxAge }));

  const refreshOpts = baseCookieOptions({ path: "/api/auth" });
  if (rememberMe) {
    refreshOpts.maxAge = refreshMaxAge;
  }
  res.cookie(REFRESH_COOKIE, refreshToken, refreshOpts);
}

function clearAuthCookies(res) {
  const clearOpts = baseCookieOptions({ maxAge: 0 });
  res.clearCookie(ACCESS_COOKIE, clearOpts);
  res.clearCookie(REFRESH_COOKIE, baseCookieOptions({ path: "/api/auth", maxAge: 0 }));
  // Also clear legacy path=/ cookies
  res.clearCookie(REFRESH_COOKIE, baseCookieOptions({ maxAge: 0 }));
}

function getAccessTokenFromRequest(req) {
  if (req.cookies?.[ACCESS_COOKIE]) return req.cookies[ACCESS_COOKIE];
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  return null;
}

function getRefreshTokenFromRequest(req) {
  return (
    req.cookies?.[REFRESH_COOKIE] ||
    req.body?.refreshToken ||
    req.headers["x-refresh-token"] ||
    null
  );
}

module.exports = {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  setAuthCookies,
  clearAuthCookies,
  getAccessTokenFromRequest,
  getRefreshTokenFromRequest,
  baseCookieOptions,
};
