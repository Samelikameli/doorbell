"use client";
// pages/admin/index.tsx

import React from "react";
import { useRouter } from "next/navigation";

import { getAuth, signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import { default as app } from "../../firebase";
import { Button } from "@heroui/react";

const provider = new GoogleAuthProvider();
const auth = getAuth(app);

const AdminPage: React.FC = () => {
    const router = useRouter();

    const handleSignIn = async () => {
        try {
            const params = new URLSearchParams(window.location.search);

            const redirectUrl = params.get("redirect") || "/";

            await signInWithPopup(auth, provider);
            router.push(redirectUrl);
        } catch (error) {
            console.error("Error signing in:", error);
        }
    };

    return (
        <div className="flex justify-center items-center flex-col w-full text-foreground bg-background min-h-screen gap-4">
            <span className="text-2xl lg:text-3xl font-semibold mb-4">Kirjaudu sisään</span>
            <p>Kirjaudu sisään, jotta voit luoda ja hallinnoida kokouksia</p>
            <p>Osa kokouksista voi myös vaatia kirjautumisen</p>
            <Button onClick={handleSignIn}>
                Kirjaudu sisään Google-tililläsi
            </Button>
        </div>
    );
};

export default AdminPage;