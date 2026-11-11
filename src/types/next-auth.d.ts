import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
    /** Set while a superadmin acts as another user: the superadmin's own id. */
    realUserId?: string;
  }
}
