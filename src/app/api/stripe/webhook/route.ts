// src/app/api/stripe/webhook/route.ts
import Stripe from "stripe";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

type InvoiceWithMaybeSubscription = Stripe.Invoice & {
    subscription?: string | Stripe.Subscription | null;
};

type SubscriptionWithPeriod = Stripe.Subscription & {
    current_period_end?: number | null;
};

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
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return new NextResponse(`Webhook Error: ${message}`, { status: 400 });
    }

    const supabase = supabaseAdmin();

    async function upsertCustomerMap(customerId: string, userId?: string) {
        if (!userId) return;

        const { error } = await supabase.from("stripe_customers").upsert(
            {
                user_id: userId,
                stripe_customer_id: customerId,
                updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" }
        );

        if (error) console.error("[webhook] upsertCustomerMap error", error);
    }

    async function resolveUserIdByCustomer(customerId: string) {
        const { data, error } = await supabase
            .from("stripe_customers")
            .select("user_id")
            .eq("stripe_customer_id", customerId)
            .maybeSingle();

        if (error) {
            console.error("[webhook] resolveUserIdByCustomer error", error);
            return undefined;
        }
        return data?.user_id ?? undefined;
    }

    async function upsertSubscription(subRaw: Stripe.Subscription, userId?: string) {
        const sub = subRaw as SubscriptionWithPeriod;

        const customerId =
            typeof sub.customer === "string" ? sub.customer : sub.customer.id;

        if (!userId) userId = await resolveUserIdByCustomer(customerId);
        if (!userId) return;

        const priceId = sub.items.data[0]?.price?.id ?? null;

        const currentPeriodEnd =
            typeof sub.current_period_end === "number"
                ? new Date(sub.current_period_end * 1000).toISOString()
                : null;

        await upsertCustomerMap(customerId, userId);

        const { error } = await supabase.from("stripe_subscriptions").upsert(
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

        if (error) {
            console.error("[webhook] upsertSubscription error", {
                error,
                userId,
                customerId,
                subId: sub.id,
            });
        }
    }

    try {
        switch (event.type) {
            case "checkout.session.completed": {
                const session = event.data.object as Stripe.Checkout.Session;

                const userId =
                    (session.client_reference_id as string | null) ??
                    (session.metadata?.user_id as string | undefined);

                const customerId =
                    typeof session.customer === "string"
                        ? session.customer
                        : session.customer?.id;

                if (customerId) await upsertCustomerMap(customerId, userId);

                const subId =
                    typeof session.subscription === "string"
                        ? session.subscription
                        : session.subscription?.id;

                if (subId) {
                    const sub = await stripe.subscriptions.retrieve(subId);
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
                const invoice = event.data.object as InvoiceWithMaybeSubscription;

                const subId =
                    typeof invoice.subscription === "string"
                        ? invoice.subscription
                        : invoice.subscription?.id ?? null;

                if (subId) {
                    const sub = await stripe.subscriptions.retrieve(subId);
                    await upsertSubscription(sub);
                }
                break;
            }

            default:
                break;
        }
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Unknown error";
        return new NextResponse(`Webhook handler failed: ${message}`, {
            status: 500,
        });
    }

    return NextResponse.json({ received: true });
}
