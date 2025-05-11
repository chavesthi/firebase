
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

    const body = await req.json().catch(() => ({}));
    const userIdFromBody = body.userId;
    const firebaseUser = auth.currentUser; 

    if (firebaseUser) {
        userId = firebaseUser.uid;
        userEmail = firebaseUser.email;
    } else if (userIdFromBody) {
        userId = userIdFromBody;
        const userDocRef = doc(firestore, "users", userId);
        const userDoc = await getDoc(userDocRef);
        if (userDoc.exists() && userDoc.data().email) {
            userEmail = userDoc.data().email;
        }
    } else {
        return NextResponse.json({ message: "Unauthorized: User not authenticated or UID not provided." }, { status: 401 });
    }
    
    if (!userEmail) {
        const userDocRef = doc(firestore, "users", userId);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists() && userDocSnap.data().email) {
            userEmail = userDocSnap.data().email;
        } else {
             return NextResponse.json({ message: "User email not found in Firestore or auth session." }, { status: 404 });
        }
    }

    const stripeSession = await stripe.checkout.sessions.create({
        success_url: `${APP_URL}/partner/settings?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${APP_URL}/partner/settings?canceled=true`,
        payment_method_types: ["card", "pix"], // Added "pix"
        mode: "subscription",
        billing_address_collection: 'auto',
        customer_email: userEmail, 
        line_items: [
            {
                price: "price_YOUR_STRIPE_SUBSCRIPTION_PRICE_ID", 
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
