
import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { auth, firestore } from '@/lib/firebase';
import { stripe } from '@/lib/stripe'; // Server-side Stripe instance
import { doc, getDoc } from 'firebase/firestore';
import { APP_URL } from '@/lib/constants';

export async function POST(req: NextRequest) {
  try {
    // It's important to authenticate the user on the server-side.
    // This example attempts to get user details from the request body if not directly available from Firebase Auth session.
    // For production, ensure robust authentication and authorization.

    let userId: string;
    let userEmail: string | null = null; // Initialize userEmail to null

    const body = await req.json().catch(() => ({})); // Attempt to parse body, default to empty object on failure
    const userIdFromBody = body.userId;

    // Attempt to get Firebase Auth session (might be null in some API route contexts)
    // This direct usage of auth.currentUser is often unreliable in API routes without session management.
    // Consider passing an ID token from the client and verifying it here using Firebase Admin SDK for production.
    const firebaseUser = auth.currentUser; 

    if (firebaseUser) {
        userId = firebaseUser.uid;
        userEmail = firebaseUser.email;
    } else if (userIdFromBody) {
        userId = userIdFromBody;
        // Fetch email from Firestore if userId is from body
        const userDocRef = doc(firestore, "users", userId);
        const userDoc = await getDoc(userDocRef);
        if (userDoc.exists() && userDoc.data().email) {
            userEmail = userDoc.data().email;
        }
    } else {
        return NextResponse.json({ message: "Unauthorized: User not authenticated or UID not provided." }, { status: 401 });
    }
    
    if (!userEmail) { // Check if userEmail was successfully retrieved
        const userDocRef = doc(firestore, "users", userId);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists() && userDocSnap.data().email) {
            userEmail = userDocSnap.data().email;
        } else {
             return NextResponse.json({ message: "User email not found in Firestore or auth session." }, { status: 404 });
        }
    }


    // Use the shared stripe instance from @/lib/stripe
    const stripeSession = await stripe.checkout.sessions.create({
        success_url: `${APP_URL}/partner/settings?session_id={CHECKOUT_SESSION_ID}`, // Stripe will replace {CHECKOUT_SESSION_ID}
        cancel_url: `${APP_URL}/partner/settings?canceled=true`,
        payment_method_types: ["card"],
        mode: "subscription",
        billing_address_collection: 'auto',
        customer_email: userEmail, 
        line_items: [
            {
                // IMPORTANT: Replace this Price ID with the one from your Stripe Dashboard
                // that corresponds to your 2 BRL Fervo Partner Plan.
                // The amount (e.g., 200 for 2 BRL in cents) is configured in Stripe when you create the Price.
                // This price should be associated with Product ID: prod_SHojYpc0gOmFYM
                price: "price_YOUR_STRIPE_SUBSCRIPTION_PRICE_ID", // <<< ENSURE THIS IS REPLACED with a Price ID linked to prod_SHojYpc0gOmFYM
                quantity: 1,
            },
        ],
        metadata: {
            userId: userId, // Store Firebase UID
        },
    });
    return NextResponse.json({ url: stripeSession.url });

  } catch (error: any) {
    console.error("[STRIPE_CHECKOUT_ERROR]", error);
    // Return a JSON response for errors to be properly parsed by the client
    return NextResponse.json({ 
        message: "Internal Server Error creating checkout session.", 
        error: error.message // Include Stripe's error message if available
    }, { status: 500 });
  }
}

// IMPORTANT: You need to replace "price_YOUR_STRIPE_SUBSCRIPTION_PRICE_ID"
// with an actual Price ID from your Stripe Dashboard that is set to 2 BRL (or its equivalent in cents)
// and is associated with Product ID prod_SHojYpc0gOmFYM.
// Create a Product in Stripe (if prod_SHojYpc0gOmFYM doesn't exist or is not what you intend), 
// then create a recurring Price for it (e.g., 2.00 BRL).

