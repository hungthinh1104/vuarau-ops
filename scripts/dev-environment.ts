const NEVER_FORWARD_TO_DEV_CHILDREN = ["SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"] as const;

/**
 * The application never uses elevated Supabase API keys. Keep them out of
 * local API/web child processes even when a developer's shell or .env file
 * contains one, while leaving the server's fail-closed configuration guard in
 * place for every other entry point. Empty values are intentional: package
 * scripts may load `.env` again, but Node does not replace an explicitly
 * provided environment value with a value from that file.
 */
export function developmentChildEnvironment(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const childEnvironment = { ...environment };
  for (const variable of NEVER_FORWARD_TO_DEV_CHILDREN) {
    childEnvironment[variable] = "";
  }
  return childEnvironment;
}
