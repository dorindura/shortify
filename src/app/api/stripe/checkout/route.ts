import Stripe from "stripe";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {requireUserNext} from "@server/auth/requireUserNext";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST() {
    const user = await requireUserNext();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const priceId = process.env.STRIPE_PRICE_PRO_MONTHLY!;
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL!;
    const supabase = supabaseAdmin();

    const { data: customerRow } = await supabase
        .from("stripe_customers")
        .select("stripe_customer_id")
        .eq("user_id", user.id)
        .maybeSingle();

    let stripeCustomerId = customerRow?.stripe_customer_id ?? null;

    if (!stripeCustomerId) {
        const customer = await stripe.customers.create({
            email: user.email ?? undefined,
            metadata: { user_id: user.id },
        });

        stripeCustomerId = customer.id;

        await supabase.from("stripe_customers").upsert(
            {
                user_id: user.id,
                stripe_customer_id: stripeCustomerId,
                updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" }
        );
    }

    const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: stripeCustomerId,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${siteUrl}/dashboard?billing=success`,
        cancel_url: `${siteUrl}/dashboard?billing=cancel`,
        client_reference_id: user.id,
        metadata: { user_id: user.id },
        subscription_data: {
            metadata: { user_id: user.id },
        },
        allow_promotion_codes: true,
    });

    return NextResponse.json({ url: session.url });
}
