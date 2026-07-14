import { AsyncLocalStorage } from "node:async_hooks";
import type { ApiCredentialProvider, AuthContext } from "./auth.js";

export type RequestContext = { auth: AuthContext; credentials: ApiCredentialProvider };
const storage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

export function getRequestContext(): RequestContext {
  const context = storage.getStore();
  if (!context) throw new Error("No authenticated request context");
  return context;
}

export function runInvocationWithContext<T>(context: RequestContext | undefined, fn: () => T): T {
  return context ? runWithRequestContext(context, fn) : fn();
}
