
import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { auth, firestore } from '@/lib/firebase';
import { stripe } from '@/lib/stripe'; // Server-side Stripe instance
import { doc, getDoc } from 'firebase/firestore';
import { APP_URL } from '@/lib/constants';

export async function POST(req: NextRequest) {
  try {
    // It's important to authenticate the user on the server-side.
    // How you get the current user depends on your auth setup with Next.js and Firebase.
    // This example assumes you have a way to get the Firebase user from the request,
    // e.g., by verifying an ID token passed in headers.
    // For simplicity, this example directly uses firebase auth.currentUser which might not work reliably in API routes without custom session management.
    // Consider using Firebase Admin SDK or passing user ID securely from client if auth.currentUser is null here.
    
    const firebaseUser = auth.currentUser; // This might be null in API routes.
                                       // You might need to send the UID from client and verify it here,
                                       // or use Firebase Admin SDK with a session cookie.

    let userId: string;
    let userEmail: string | null;

    if (!firebaseUser) {
        // Try to get UID from request body if passed (less secure, for example only)
        let userIdFromBody;
        try {
            const body = await req.json();
            userIdFromBody = body.userId;
        } catch (e) {
            // no body or invalid json
        }

        if (!userIdFromBody) {
             return new NextResponse("Unauthorized: User not authenticated or UID not provided.", { status: 401 });
        }
        userId = userIdFromBody;
        const userDocRef = doc(firestore, "users", userId);
        const userDoc = await getDoc(userDocRef);

        if (!userDoc.exists()) {
            return new NextResponse("User not found", { status: 404 });
        }
        const userData = userDoc.data();
        if (!userData || !userData.email) {
             return new NextResponse("User data or email not found", { status: 404 });
        }
        userEmail = userData.email;

    } else {
        userId = firebaseUser.uid;
        userEmail = firebaseUser.email;
        const userDocRef = doc(firestore, "users", userId);
        const userDoc = await getDoc(userDocRef);

        if (!userDoc.exists()) {
            return new NextResponse("User not found", { status: 404 });
        }
        // Email from auth object is preferred if available and user is directly authenticated
        userEmail = firebaseUser.email || userDoc.data()?.email; 
         if (!userEmail) { 
            return new NextResponse("User email not found", { status: 404 });
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
                price: "price_YOUR_STRIPE_SUBSCRIPTION_PRICE_ID", 
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
    return new NextResponse("Internal Server Error: " + error.message, { status: 500 });
  }
}

// IMPORTANT: You need to replace "price_YOUR_STRIPE_SUBSCRIPTION_PRICE_ID"
// with an actual Price ID from your Stripe Dashboard that is set to 2 BRL (or its equivalent in cents).
// Create a Product in Stripe, then create a recurring Price for it (e.g., 2.00 BRL).
