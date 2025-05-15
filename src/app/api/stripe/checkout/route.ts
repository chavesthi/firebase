
import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { auth, firestore } from '@/lib/firebase'; // Assuming you have auth here or will pass UID
import { stripe } from '@/lib/stripe';
import { doc, getDoc } from 'firebase/firestore';
import { APP_URL, STRIPE_PRICE_ID } from '@/lib/constants';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const userId = body.userId;

    if (!userId) {
      return NextResponse.json({ message: "User ID is required." }, { status: 400 });
    }

    const userDocRef = doc(firestore, "users", userId);
    const userDocSnap = await getDoc(userDocRef);

    if (!userDocSnap.exists()) {
      return NextResponse.json({ message: "User not found." }, { status: 404 });
    }
    const userData = userDocSnap.data();
    const userEmail = userData?.email;

    if (!userEmail) {
      return NextResponse.json({ message: "User email not found." }, { status: 400 });
    }

    // Check STRIPE_PRICE_ID validity
    if (!STRIPE_PRICE_ID) {
        console.error("Stripe Price ID is not configured. Please set NEXT_PUBLIC_STRIPE_PRICE_ID in your .env file or constants.ts. Current value is empty or null.");
        return NextResponse.json({ message: "Stripe Price ID not configured on the server. It's missing." }, { status: 500 });
    }
    // The placeholder "YOUR_STRIPE_PRICE_ID_HERE" was specific to a previous prompt.
    // A more general check for a placeholder might involve checking against common placeholder patterns if needed,
    // but the primary check should be `!STRIPE_PRICE_ID.startsWith("price_")`.
    if (STRIPE_PRICE_ID === "YOUR_STRIPE_PRICE_ID_HERE" || STRIPE_PRICE_ID === "price_YOUR_FERVO_PLAN_PRICE_ID") { // Check against common old placeholders
        console.error("Stripe Price ID is still set to a placeholder value:", STRIPE_PRICE_ID, ". Please update it in .env or constants.ts.");
        return NextResponse.json({ message: "Stripe Price ID is a placeholder. Please configure a valid Price ID." }, { status: 500 });
    }
    if (!STRIPE_PRICE_ID.startsWith("price_")) {
        console.error(`Invalid Stripe Price ID configured: ${STRIPE_PRICE_ID}. It should start with 'price_'.`);
        return NextResponse.json({ message: `Invalid Stripe Price ID format. Ensure it's a Price ID (starts with 'price_'), not a Product ID.` }, { status: 500 });
    }


    const stripeSession = await stripe.checkout.sessions.create({
      success_url: `${APP_URL}/partner/settings?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/partner/settings?canceled=true`,
      payment_method_types: ["card"],
      mode: "subscription",
      billing_address_collection: 'auto',
      customer_email: userEmail,
      line_items: [
        {
          price: STRIPE_PRICE_ID,
          quantity: 1,
        },
      ],
      metadata: {
        userId: userId,
      },
    });

    return NextResponse.json({ url: stripeSession.url });

  } catch (error: any) {
    console.error("[STRIPE_CHECKOUT_ERROR]", error);
    // Return a more specific error message if available from Stripe or other errors
    const errorMessage = error.message || "An unexpected error occurred while creating the checkout session.";
    return NextResponse.json({ 
        message: errorMessage, // Use the specific error message here
        errorDetails: error.raw?.message || error.message // Keep full error for potential server-side logging if needed elsewhere
    }, { status: 500 });
  }
}
