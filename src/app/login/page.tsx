"use client";
// pages/admin/index.tsx
import { useRouter } from "next/navigation";

import { getAuth, signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import { default as app } from "../../firebase";
import { HeroUIProvider } from "@heroui/react";
import {Button} from "@heroui/button";

const provider = new GoogleAuthProvider();
const auth = getAuth(app);

const AdminPage: React.FC = () => {
    const router = useRouter();

    const handleSignIn = async () => {
        try {
            await signInWithPopup(auth, provider);
            router.push("/admin/dashboard");
        } catch (error) {
            console.error("Error signing in: ", error);
        }
    };

    return (
        <HeroUIProvider>
            <div className={`flex justify-center items-center flex-col w-full text-foreground bg-background min-h-screen gap-4`}>
                <h1 className="flex">Admin Login</h1>
                <Button className="flex" color="success" size="lg" onPress={handleSignIn}>
                    Kirjaudu sisään Google-tililläsi
                </Button>
            </div>
        </HeroUIProvider>
    );
};

export default AdminPage;