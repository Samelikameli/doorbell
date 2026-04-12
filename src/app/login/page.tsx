"use client";
// pages/admin/index.tsx
import { useRouter } from "next/navigation";
import React from 'react';

import { getAuth, signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import { default as app } from "../../firebase";

const provider = new GoogleAuthProvider();
const auth = getAuth(app);

const AdminPage: React.FC = () => {
    const router = useRouter();

    const handleSignIn = async () => {
        try {
            await signInWithPopup(auth, provider);
            router.push("/");
        } catch (error) {
            console.error("Error signing in: ", error);
        }
    };

    return (
            <div className={`flex justify-center items-center flex-col w-full text-foreground bg-background min-h-screen gap-4`}>
                <h1 className="flex">Admin Login</h1>
                <button className="flex" color="success" onClick={handleSignIn}>
                    Kirjaudu sisään Google-tililläsi
                </button>
            </div>
    );
};

export default AdminPage;