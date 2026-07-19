/**
 * Authentication helpers for integration tests.
 */
"use strict";

const { strongPassword } = require("./fixtures");
const { uniqueName } = require("./temp-fs");

async function registerUser(api, jar, overrides = {}) {
  const email =
    overrides.email || `${uniqueName("user")}@test.openclaw.local`.toLowerCase();
  const password = overrides.password || strongPassword;
  const name = overrides.name || "Integration User";

  const res = await api.post(
    "/api/auth/register",
    {
      name,
      email,
      password,
      confirmPassword: password,
      acceptTerms: true,
    },
    { jar },
  );

  return { res, email, password, name };
}

async function loginUser(api, jar, email, password) {
  return api.post(
    "/api/auth/login",
    { email, password, rememberMe: true },
    { jar },
  );
}

async function registerAndLogin(api, overrides = {}) {
  const jar = api.jar();
  const unique = overrides.name || `Integration User ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const { res: reg, email, password, name } = await registerUser(api, jar, {
    ...overrides,
    name: unique,
  });
  if (reg.status !== 201) {
    const err = new Error(`register failed: ${reg.status} ${reg.text}`);
    err.response = reg;
    throw err;
  }
  const login = await loginUser(api, jar, email, password);
  if (login.status !== 200) {
    const err = new Error(`login failed: ${login.status} ${login.text}`);
    err.response = login;
    throw err;
  }
  return {
    jar,
    email,
    password,
    name,
    user: login.body?.user,
    accessToken: jar.get("accessToken"),
    refreshToken: jar.get("refreshToken"),
  };
}

async function authHeaders(api, overrides = {}) {
  const session = await registerAndLogin(api, overrides);
  return {
    ...session,
    headers: { Authorization: `Bearer ${session.accessToken}` },
  };
}

module.exports = {
  registerUser,
  loginUser,
  registerAndLogin,
  authHeaders,
};
