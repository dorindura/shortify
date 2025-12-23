import Stripe from "stripe";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: Request) {
    const sig = req.headers.get("stripe-signature");
    if (!sig) return new NextResponse("Missing stripe-signature", { status: 400 });

    const body = await req.text();

    let event: Stripe.Event;
    try {
        event = stripe.webhooks.constructEvent(
            body,
            sig,
            process.env.STRIPE_WEBHOOK_SECRET!
        );
    } catch (err: any) {
        return new NextResponse(`Webhook Error: ${err.message}`, { status: 400 });
    }

    const supabase = supabaseAdmin();

    async function upsertCustomerMap(customerId: string, userId?: string) {
        if (!userId) return;

        await supabase.from("stripe_customers").upsert(
            {
                user_id: userId,
                stripe_customer_id: customerId,
                updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" }
        );
    }

    async function upsertSubscription(sub: Stripe.Subscription, userId?: string) {
        const customerId =
            typeof sub.customer === "string" ? sub.customer : sub.customer.id;

        if (!userId) {
            const { data } = await supabase
                .from("stripe_customers")
                .select("user_id")
                .eq("stripe_customer_id", customerId)
                .maybeSingle();
            userId = data?.user_id ?? undefined;
        }
        if (!userId) return;

        const priceId = sub.items.data[0]?.price?.id ?? null;

        const currentPeriodEnd =
            typeof sub.current_period_end === "number"
                ? new Date(sub.current_period_end * 1000).toISOString()
                : null;

        await upsertCustomerMap(customerId, userId);

        await supabase.from("stripe_subscriptions").upsert(
            {
                user_id: userId,
                stripe_customer_id: customerId,
                stripe_subscription_id: sub.id,
                status: sub.status,
                price_id: priceId,
                current_period_end: currentPeriodEnd,
                cancel_at_period_end: sub.cancel_at_period_end ?? false,
                updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" }
        );
    }

    try {
        switch (event.type) {
            case "checkout.session.completed": {
                const session = event.data.object as Stripe.Checkout.Session;

                const userId =
                    (session.client_reference_id as string) ||
                    (session.metadata?.user_id as string | undefined);

                const customerId =
                    typeof session.customer === "string"
                        ? session.customer
                        : session.customer?.id;

                if (customerId) await upsertCustomerMap(customerId, userId);

                if (session.subscription && typeof session.subscription === "string") {
                    const sub = await stripe.subscriptions.retrieve(session.subscription);
                    await upsertSubscription(sub, userId);
                }
                break;
            }

            case "customer.subscription.created":
            case "customer.subscription.updated":
            case "customer.subscription.deleted": {
                const sub = event.data.object as Stripe.Subscription;
                await upsertSubscription(sub);
                break;
            }

            case "invoice.payment_failed":
            case "invoice.payment_succeeded": {
                const invoice = event.data.object as Stripe.Invoice;

                console.log("or maybe even faster?")

                const subId =
                    typeof invoice.subscription === "string"
                        ? invoice.subscription
                        : typeof invoice.subscription === "object" && invoice.subscription
                            ? invoice.subscription.id
                            : null;

                console.log("does it fail here?")

                if (subId) {
                    const sub = await stripe.subscriptions.retrieve(subId);
                    await upsertSubscription(sub);
                }
                break;
            }

            default:
                break;
        }
    } catch (e: any) {
        return new NextResponse(`Webhook handler failed: ${e.message}`, { status: 500 });
    }

    return NextResponse.json({ received: true });
}
