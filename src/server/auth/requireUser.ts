import { FastifyReply, FastifyRequest } from "fastify";
import { createClient } from "@supabase/supabase-js";

const supabaseAuthClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
);

export type AuthedUser = {
    id: string;
    email?: string | null;
};

export async function requireUser(
    req: FastifyRequest,
    reply: FastifyReply
): Promise<AuthedUser | null> {
    const auth = req.headers.authorization || "";
    const match = auth.match(/^Bearer\s+(.+)$/i);
    const token = match?.[1];

    if (!token) {
        reply.code(401).send({ error: "Missing Authorization Bearer token" });
        return null;
    }

    const { data, error } = await supabaseAuthClient.auth.getUser(token);

    if (error || !data?.user) {
        reply.code(401).send({ error: "Invalid/expired token" });
        return null;
    }

    return { id: data.user.id, email: data.user.email };
}
