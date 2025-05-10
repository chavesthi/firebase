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

    if (!firebaseUser) {
        // A more robust solution would be to check a session cookie or an Authorization header
        // For now, we'll rely on the client ensuring the user is logged in before calling this.
        // If you have the UID from the client, you can use that directly.
        // This part needs careful review based on your actual auth flow in API routes.
        // For this example, let's assume the client ensures auth.
        // If this were a real production app, you'd need to secure this properly.
        
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
        // Here you would ideally verify this userId or use a secure session.
        // For this example, we'll proceed assuming this userId is valid.
        // This is NOT production-ready auth for an API route.
        const userDocRef = doc(firestore, "users", userIdFromBody);
        const userDoc = await getDoc(userDocRef);

        if (!userDoc.exists()) {
            return new NextResponse("User not found", { status: 404 });
        }
        const userData = userDoc.data();
        if (!userData || !userData.email) {
             return new NextResponse("User data or email not found", { status: 404 });
        }

        // Use the shared stripe instance from @/lib/stripe
        const stripeSession = await stripe.checkout.sessions.create({
            success_url: `${APP_URL}/partner/settings?session_id={CHECKOUT_SESSION_ID}`, // Stripe will replace {CHECKOUT_SESSION_ID}
            cancel_url: `${APP_URL}/partner/settings?canceled=true`, // Added cancel parameter
            payment_method_types: ["card"],
            mode: "subscription",
            billing_address_collection: 'auto',
            customer_email: userData.email, 
            line_items: [
                {
                    // Replace with your actual Price ID from Stripe Dashboard
                    price: "price_YOUR_STRIPE_SUBSCRIPTION_PRICE_ID", 
                    quantity: 1,
                },
            ],
            metadata: {
                userId: userIdFromBody, // Store Firebase UID
            },
        });
        return NextResponse.json({ url: stripeSession.url });

    } else {
        // User is available via auth.currentUser (e.g., client-side rendering calling API route, or during dev with hot-reloading session)
        const userDocRef = doc(firestore, "users", firebaseUser.uid);
        const userDoc = await getDoc(userDocRef);

        if (!userDoc.exists()) {
            return new NextResponse("User not found", { status: 404 });
        }
        const userData = userDoc.data();
         if (!userData || !firebaseUser.email) { // Use firebaseUser.email as fallback
            return new NextResponse("User data or email not found", { status: 404 });
        }

        // Use the shared stripe instance from @/lib/stripe
        const stripeSession = await stripe.checkout.sessions.create({
            success_url: `${APP_URL}/partner/settings?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${APP_URL}/partner/settings?canceled=true`, // Added cancel parameter
            payment_method_types: ["card"],
            mode: "subscription",
            billing_address_collection: 'auto',
            customer_email: firebaseUser.email,
            line_items: [
                {
                    price: "price_YOUR_STRIPE_SUBSCRIPTION_PRICE_ID", 
                    quantity: 1,
                },
            ],
            metadata: {
                userId: firebaseUser.uid,
            },
        });
        return NextResponse.json({ url: stripeSession.url });
    }

  } catch (error: any) {
    console.error("[STRIPE_CHECKOUT_ERROR]", error);
    return new NextResponse("Internal Server Error: " + error.message, { status: 500 });
  }
}

// IMPORTANT: You need to replace "price_YOUR_STRIPE_SUBSCRIPTION_PRICE_ID"
// with an actual Price ID from your Stripe Dashboard.
// Create a Product in Stripe, then create a recurring Price for it.