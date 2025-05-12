
import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { auth, firestore } from '@/lib/firebase'; // Assuming you have auth here or will pass UID
import { stripe } from '@/lib/stripe';
import { doc, getDoc } from 'firebase/firestore';
import { APP_URL, STRIPE_PRICE_ID } from '@/lib/constants';

export async function POST(req: NextRequest) {
  try {
    // For API routes, you'd typically verify an ID token passed in the Authorization header
    // or get user ID from a secure session.
    // For simplicity, we'll expect userId in the request body for now.
    // In a production app, ensure this userId is validated (e.g., matches an authenticated session).
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

    if (!STRIPE_PRICE_ID || STRIPE_PRICE_ID === "price_YOUR_FERVO_PLAN_PRICE_ID") {
        console.error("Stripe Price ID is not configured. Please set NEXT_PUBLIC_STRIPE_PRICE_ID in your .env file.");
        return NextResponse.json({ message: "Stripe Price ID not configured on the server. Ensure it's a Price ID (starts with 'price_')." }, { status: 500 });
    }
    if (!STRIPE_PRICE_ID.startsWith("price_")) {
        console.error(`Invalid Stripe Price ID configured: ${STRIPE_PRICE_ID}. It should start with 'price_'.`);
        return NextResponse.json({ message: `Invalid Stripe Price ID. Ensure it's a Price ID (starts with 'price_'), not a Product ID.` }, { status: 500 });
    }


    const stripeSession = await stripe.checkout.sessions.create({
      success_url: `${APP_URL}/partner/settings?session_id={CHECKOUT_SESSION_ID}`, // Redirect back to settings page on success
      cancel_url: `${APP_URL}/partner/settings?canceled=true`, // Redirect back on cancellation
      payment_method_types: ["card"],
      mode: "subscription",
      billing_address_collection: 'auto', // 'required' or 'auto'
      customer_email: userEmail, // Pre-fill customer email
      line_items: [
        {
          price: STRIPE_PRICE_ID, // The ID of your Fervo Plan Price in Stripe
          quantity: 1,
        },
      ],
      metadata: {
        userId: userId, // Store Firebase UID in Stripe metadata
      },
    });

    // Return the session URL to the client
    return NextResponse.json({ url: stripeSession.url });

  } catch (error: any) {
    console.error("[STRIPE_CHECKOUT_ERROR]", error);
    return NextResponse.json({ 
        message: "Internal Server Error creating checkout session.", 
        error: error.message 
    }, { status: 500 });
  }
}
