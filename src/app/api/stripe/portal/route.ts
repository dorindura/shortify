import Stripe from "stripe";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireUserNext } from "@server/auth/requireUserNext";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST() {
  const user = await requireUserNext();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = supabaseAdmin();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL!;
  
  const { data: customerRow } = await supabase
    .from("stripe_customers")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!customerRow?.stripe_customer_id) {
    return NextResponse.json({ error: "No stripe customer found" }, { status: 404 });
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: customerRow.stripe_customer_id,
    return_url: `${siteUrl}/dashboard`,
  });

  return NextResponse.json({ url: session.url });
}
