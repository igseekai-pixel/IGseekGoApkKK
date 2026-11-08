import { firebaseClient } from "@/lib/firebase-service";

type SignInOptions = {
  redirect_uri?: string;
  extraParams?: Record<string, string>;
};

export const lovable = {
  auth: {
    signInWithOAuth: async (provider: "google" | "apple" | "microsoft" | "lovable", _opts?: SignInOptions) => {
      if (provider === "google") {
        const res = await firebaseClient.auth.signInWithGoogle();
        if (res.error) {
          return { error: res.error, redirected: false };
        }
        return { error: null, redirected: false, user: res.data.user };
      }
      return { error: new Error(`Provider ${provider} not supported`), redirected: false };
    },
  },
};
