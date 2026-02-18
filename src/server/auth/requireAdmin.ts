// src/server/auth/requireAdmin.ts
import { FastifyReply, FastifyRequest } from "fastify";
import { requireUser } from "./requireUser";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  const user = await requireUser(req, reply);
  if (!user) return null;

  const supabase = supabaseAdmin();
  const { data, error } = await supabase.from("profiles").select("role").eq("id", user.id).single();

  if (error || !data || data.role !== "admin") {
    reply.code(403).send({ error: "Admin only" });
    return null;
  }

  return user;
}
