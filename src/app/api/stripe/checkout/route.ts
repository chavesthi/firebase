import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { auth, firestore } from '@/lib/firebase';
import { stripe } from '@/lib/stripe'; // Server-side Stripe instance
import { doc, getDoc } from 'firebase/firestore';
import { APP_URL } from '@/lib/constants';

export async function POST(req: NextRequest) {
  try {
    let userId: string;
    let userEmail: string | null = null;

    // Prefer using authenticated user session if available
    // This part might need adjustment based on how you manage sessions for API routes
    // For simplicity, assuming userId is passed in body if no direct Firebase Auth session is available in this context.
    const body = await req.json().catch(() => ({}));
    const userIdFromBody = body.userId; 
    
    // Ideally, you'd verify a Firebase ID token passed in the request headers
    // For now, we'll assume if userIdFromBody is present, it's a valid Firebase UID
    // and we'll fetch the email from Firestore.

    if (userIdFromBody) { // Check if userId is provided in the body
        userId = userIdFromBody;
        const userDocRef = doc(firestore, "users", userId);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists() && userDocSnap.data()?.email) {
            userEmail = userDocSnap.data()?.email;
        } else {
            // Fallback or handle error if email not found for provided userId
            console.warn(`Email not found for userId: ${userId} in Firestore.`);
        }
    } else {
        // If no userId in body, try to get from Firebase Auth session if this API route is authenticated
        // This depends on how your Next.js API routes handle Firebase Auth sessions.
        // For this example, we'll throw an error if no userId can be determined.
        return NextResponse.json({ message: "Unauthorized: User ID not provided or session not available." }, { status: 401 });
    }
    
    if (!userEmail) {
         return NextResponse.json({ message: "User email not found for the provided user ID." }, { status: 404 });
    }

    // IMPORTANT: Replace 'price_YOUR_STRIPE_SUBSCRIPTION_PRICE_ID' with your actual Stripe Price ID
    const stripePriceId = "price_YOUR_STRIPE_SUBSCRIPTION_PRICE_ID"; 
    if (stripePriceId === "price_YOUR_STRIPE_SUBSCRIPTION_PRICE_ID") {
        console.error("Stripe Price ID is not configured. Please replace the placeholder.");
        return NextResponse.json({ message: "Stripe Price ID not configured on the server." }, { status: 500 });
    }


    const stripeSession = await stripe.checkout.sessions.create({
        success_url: `${APP_URL}/partner/settings?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${APP_URL}/partner/settings?canceled=true`,
        payment_method_types: ["card"], // "pix" can be added if configured in Stripe
        mode: "subscription",
        billing_address_collection: 'auto',
        customer_email: userEmail, 
        line_items: [
            {
                price: stripePriceId, 
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
    return NextResponse.json({ 
        message: "Internal Server Error creating checkout session.", 
        error: error.message 
    }, { status: 500 });
  }
}
